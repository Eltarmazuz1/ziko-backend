const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const smsService = require('../services/smsService');

router.post('/register', async (req, res) => {
  try {
    const result = await authService.registerWithEmail(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/register-with-google', async (req, res) => {
  try {
    console.log('📝 Register with Google request:', req.body);
    const result = await authService.registerWithGoogle(req.body);
    console.log('📝 Register with Google result:', result);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Register with Google error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginWithEmail(email, password);
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/search-users', async (req, res) => {
  try {
    const { query } = req.body;
    const result = await authService.getUsers({ query });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userService } = require('../services/aws');
    const result = await userService.getUserById(req.params.userId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/profile/:userId', async (req, res) => {
  try {
    const result = await authService.updateUserProfile(req.params.userId, req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/change-password/:userId', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be at least 6 characters long' 
      });
    }

    const result = await authService.changePassword(
      req.params.userId, 
      currentPassword, 
      newPassword
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to normalize phone number to international format
// Note: For AWS SNS Sandbox, the number must match exactly as verified
// If verified as +9720549369402, we must send +9720549369402 (with 0)
const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;
  
  let normalized = phoneNumber.trim();
  
  // If already in international format, return as is
  if (normalized.startsWith('+')) {
    return normalized;
  }
  
  // Remove any spaces or dashes
  normalized = normalized.replace(/[\s\-]/g, '');
  
  // If it starts with 0, replace 0 with +972 (keeps the rest including leading 0)
  // Example: 0549369402 -> +9720549369402 (for AWS Sandbox compatibility)
  if (normalized.startsWith('0')) {
    normalized = '+972' + normalized; // Keep the 0 after 972
  } else if (normalized.startsWith('972')) {
    // Already has country code but no +
    normalized = '+' + normalized;
  } else {
    // Assume Israeli number without leading 0 or country code
    normalized = '+972' + normalized;
  }
  
  console.log('📞 Phone normalization:', phoneNumber, '->', normalized);
  return normalized;
};

// SMS OTP endpoints
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    console.log('📞 Received send-otp request for:', phoneNumber);
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number required' });
    }
    
    // Normalize phone number to international format
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log('📞 Normalized phone number:', normalizedPhone);
    
    // Check if user exists first
    const existingUser = await authService.getUserByPhone(normalizedPhone);
    const userExists = existingUser.success && existingUser.user;
    console.log('👤 User check result:', {
      success: existingUser.success,
      userExists: userExists,
      userId: existingUser.user?.id || 'N/A'
    });
    
    // Send appropriate message based on user existence
    console.log('📤 Calling smsService.sendOTP with:', {
      phoneNumber: normalizedPhone,
      userExists: userExists
    });
    const result = await smsService.sendOTP(normalizedPhone, userExists);
    console.log('📞 SMS send result:', JSON.stringify(result, null, 2));
    
    // Return result (includes OTP send status)
    res.json(result);
  } catch (error) {
    console.error('❌ Error in send-otp route:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, error: 'Phone number and code required' });
    }
    
    // Normalize phone number to match the format used when sending OTP
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const isValid = smsService.verifyOTP(normalizedPhone, code);
    res.json({ success: isValid, verified: isValid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/login-with-phone', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, error: 'Phone number and code required' });
    }
    
    // Normalize phone number to match the format used when sending OTP
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Verify OTP first
    const isValid = smsService.verifyOTP(normalizedPhone, code);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid or expired OTP code' });
    }
    
    // Check if user exists (use normalized phone for search)
    const existingUser = await authService.getUserByPhone(normalizedPhone);
    
    if (!existingUser.success || !existingUser.user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found. Please register first.',
        needsRegistration: true 
      });
    }
    
    // Update last login
    const { userService } = require('../services/aws');
    await userService.updateUser(existingUser.user.id, { 
      lastLoginAt: new Date().toISOString() 
    });
    
    const { passwordHash: _, ...userWithoutPassword } = existingUser.user;
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Password reset endpoints
router.post('/forgot-password', async (req, res) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) {
      return res.status(400).json({ success: false, error: 'Email or phone number required' });
    }
    
    const result = await authService.requestPasswordReset(emailOrPhone);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { emailOrPhone, resetCode, newPassword } = req.body;
    
    if (!emailOrPhone || !resetCode || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email/phone, reset code, and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters long' 
      });
    }
    
    const result = await authService.resetPassword(emailOrPhone, resetCode, newPassword);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get presigned URL for uploading profile image
router.post('/profile-image/presigned-url', async (req, res) => {
  try {
    const { userId, imageType = 'jpg' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }

    const { s3Service } = require('../services/aws');
    const result = await s3Service.getPresignedProfileImageUrl(userId, imageType);
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting presigned URL for profile image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

