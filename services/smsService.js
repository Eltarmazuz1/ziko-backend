const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// AWS SNS Configuration
const AWS_CONFIG = {
  region: process.env.AWS_REGION || process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
  },
};

// Check if AWS credentials are available
const AWS_ENABLED = !!((process.env.AWS_ACCESS_KEY_ID || process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID) && 
                        (process.env.AWS_SECRET_ACCESS_KEY || process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY));

// Initialize SNS client only if credentials are available
let snsClient = null;
if (AWS_ENABLED) {
  snsClient = new SNSClient(AWS_CONFIG);
  console.log('✅ AWS SNS Client initialized');
} else {
  console.error('❌ AWS SNS credentials not configured');
}

console.log('📱 SMS Service Config:', {
  awsEnabled: AWS_ENABLED,
  region: AWS_CONFIG.region,
  hasAccessKey: !!(AWS_CONFIG.credentials.accessKeyId),
  hasSecretKey: !!(AWS_CONFIG.credentials.secretAccessKey),
});

// Generate 6-digit OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP codes in memory (in production, use Redis or DynamoDB)
const otpStore = new Map();

// SMS Service
const smsService = {
  /**
   * Send OTP via SMS
   * @param {string} phoneNumber - Phone number to send OTP to
   * @param {boolean} userExists - Whether the user exists in the database
   * @returns {Promise<{success: boolean, code?: string, error?: string}>}
   */
  async sendOTP(phoneNumber, userExists = true) {
    try {
      // If user doesn't exist, send registration message instead of OTP
      if (!userExists) {
        console.log('📱 User not registered, sending registration message');
        const message = 'Your number is not registered with ZIKO. Please register first.';
        
        // Use AWS SNS
        if (!AWS_ENABLED) {
          console.error('❌ AWS SNS not configured');
          return { success: false, error: 'SMS service not configured', needsRegistration: true };
        }
        
        const params = {
          Message: message,
          PhoneNumber: phoneNumber,
        };
        
        console.log('📤 Sending SMS via AWS SNS:', {
          phoneNumber: phoneNumber,
          messageLength: message.length
        });
        
        const response = await snsClient.send(new PublishCommand(params));
        console.log(`✅ SMS registration message sent to ${phoneNumber} via AWS SNS`, {
          messageId: response.MessageId,
          phoneNumber: phoneNumber
        });
        
        if (response.MessageId) {
          console.log(`📱 SMS delivery initiated. MessageId: ${response.MessageId}`);
          return { success: true, messageId: response.MessageId, needsRegistration: true };
        }
        
        return { success: true, needsRegistration: true };
      }
      
      // User exists - send OTP code
      const code = generateOTP();
      
      // Store OTP with 5 minute expiration
      otpStore.set(phoneNumber, {
        code,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      const message = `Your ZIKO verification code is: ${code}`;

      // Use AWS SNS
      if (!AWS_ENABLED) {
        console.error('❌ AWS SNS not configured');
        return { success: false, error: 'SMS service not configured' };
      }

      const params = {
        Message: message,
        PhoneNumber: phoneNumber,
      };
      
      console.log('📤 Sending OTP SMS via AWS SNS:', {
        phoneNumber: phoneNumber,
        messageLength: message.length,
        codeLength: code.length
      });
      
      const response = await snsClient.send(new PublishCommand(params));
      console.log(`✅ SMS OTP sent to ${phoneNumber} via AWS SNS`, {
        messageId: response.MessageId,
        phoneNumber: phoneNumber
      });
      
      if (response.MessageId) {
        console.log(`📱 SMS delivery initiated. MessageId: ${response.MessageId}`);
        return { success: true, messageId: response.MessageId };
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending SMS:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        code: error.Code || error.$metadata?.httpStatusCode,
        $metadata: error.$metadata,
        stack: error.stack
      });
      
      // If AWS authorization fails, we need to fix IAM permissions
      if (error.message && error.message.includes('not authorized')) {
        console.error('⚠️ AWS IAM User missing SNS:Publish permission. Need to add policy.');
        return { 
          success: false, 
          error: 'SMS service configuration error. Please contact support.' 
        };
      }
      
      // Check for SNS sandbox mode error (unverified phone number)
      // In sandbox mode, phone numbers must be verified before receiving SMS
      if (error.Code === 'OptedOut' || error.message?.includes('opted out')) {
        return {
          success: false,
          error: 'This phone number has opted out of SMS. Please use a different number.'
        };
      }
      
      // Check for invalid phone number format
      if (error.Code === 'InvalidParameter' || error.message?.includes('Invalid')) {
        console.error('⚠️ Invalid phone number format:', phoneNumber);
        return {
          success: false,
          error: `Invalid phone number format: ${phoneNumber}. Phone number must be in E.164 format (e.g., +972549369402).`
        };
      }
      
      // Check for spending limit or sandbox restrictions
      if (error.Code === 'Throttling' || error.message?.includes('spending') || error.message?.includes('limit')) {
        console.warn('⚠️ SNS spending limit reached or phone number not verified (sandbox mode)');
        return {
          success: false,
          error: 'SMS service temporarily unavailable. If your AWS account is in Sandbox mode, phone numbers must be verified in AWS SNS console before receiving SMS.'
        };
      }
      
      // Check for sandbox mode - phone number not verified
      if (error.message?.includes('sandbox') || error.message?.includes('verified')) {
        console.warn('⚠️ Phone number not verified in AWS SNS Sandbox mode');
        return {
          success: false,
          error: 'Phone number must be verified in AWS SNS Sandbox mode. Please verify the number in AWS Console or request production access.'
        };
      }
      
      // Other SMS errors
      const errorMessage = error.message || 'Unknown error';
      console.error('❌ Unhandled SMS error:', errorMessage);
      return { 
        success: false, 
        error: `Failed to send SMS: ${errorMessage}. Check AWS SNS console for delivery details.` 
      };
    }
  },

  /**
   * Verify OTP code
   * @param {string} phoneNumber - Phone number
   * @param {string} code - OTP code to verify
   * @returns {boolean} - True if code is valid
   */
  verifyOTP(phoneNumber, code) {
    const storedData = otpStore.get(phoneNumber);
    
    if (!storedData) {
      console.log('❌ No OTP found for phone number');
      return false;
    }

    // Check expiration
    if (Date.now() > storedData.expiresAt) {
      console.log('❌ OTP expired');
      otpStore.delete(phoneNumber);
      return false;
    }

    // Verify code
    if (storedData.code !== code) {
      console.log('❌ Invalid OTP code');
      return false;
    }

    // Remove used OTP
    otpStore.delete(phoneNumber);
    console.log('✅ OTP verified successfully');
    return true;
  },

  /**
   * Clean up expired OTPs (call this periodically)
   */
  cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [phoneNumber, data] of otpStore.entries()) {
      if (now > data.expiresAt) {
        otpStore.delete(phoneNumber);
      }
    }
  },
};

// Clean up expired OTPs every minute
setInterval(() => {
  smsService.cleanupExpiredOTPs();
}, 60000);

module.exports = smsService;

