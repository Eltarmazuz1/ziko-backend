const { userService, dynamodb } = require('./aws');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Bcrypt salt rounds - higher is more secure but slower (10-12 is recommended)
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * Hash password using bcrypt
 * bcrypt automatically generates a unique salt for each password
 */
const hashPassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    return hash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify password against bcrypt hash
 * bcrypt.compare handles salt extraction automatically
 */
const verifyPassword = async (password, hash) => {
  try {
    // Support migration from old SHA-256 hashes
    // If hash looks like SHA-256 (64 hex chars), it's old format
    if (hash && hash.length === 64 && /^[a-f0-9]{64}$/i.test(hash)) {
      console.warn('⚠️ Detected old SHA-256 hash format. User should reset password.');
      return false; // Old hashes should be rejected, user needs to reset password
    }
    
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
};

const generateUserId = () => {
  return uuidv4();
};

const authService = {
  async registerWithEmail(userData) {
    try {
      const { email, password, name, phone } = userData;
      
      const existingUser = await this.getUserByEmail(email);
      if (existingUser.success && existingUser.user) {
        return { success: false, error: 'User already exists with this email' };
      }
      
      const userId = generateUserId();
      const passwordHash = await hashPassword(password);
      
      const newUser = {
        id: userId,
        email: email.toLowerCase(),
        phone: phone || null,
        name: name,
        profileImage: null,
        passwordHash,
        googleId: null,
        creditCard: null,
        bankAccount: null,
        authMethods: ['email'],
        isVerified: false,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const result = await userService.createUser(newUser);
      
      if (result.success) {
        const { passwordHash: _, ...userWithoutPassword } = newUser;
        return { success: true, user: userWithoutPassword };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  },

  async registerWithGoogle(userData) {
    try {
      const { email, googleId, name, profileImage } = userData;
      
      // Check if user already exists with this email or Google ID
      const existingUserByEmail = await this.getUserByEmail(email);
      if (existingUserByEmail.success && existingUserByEmail.user) {
        // User exists - return existing user
        const { passwordHash: _, ...userWithoutPassword } = existingUserByEmail.user;
        return { success: true, user: userWithoutPassword };
      }
      
      const existingUserByGoogleId = await this.getUserByGoogleId(googleId);
      if (existingUserByGoogleId.success && existingUserByGoogleId.user) {
        // User exists - return existing user
        const { passwordHash: _, ...userWithoutPassword } = existingUserByGoogleId.user;
        return { success: true, user: userWithoutPassword };
      }
      
      // Create new user
      const userId = generateUserId();
      const newUser = {
        id: userId,
        email: email.toLowerCase().trim(),
        phone: null,
        name: name || 'User',
        profileImage: profileImage || null,
        passwordHash: null,
        googleId: googleId,
        creditCard: null,
        bankAccount: null,
        authMethods: ['google'],
        isVerified: true, // Google users are pre-verified
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      console.log('📝 Creating new Google user:', { id: newUser.id, email: newUser.email, googleId: newUser.googleId });
      const result = await userService.createUser(newUser);
      console.log('📝 Create user result:', result);
      
      if (result.success) {
        const { passwordHash: _, ...userWithoutPassword } = newUser;
        return { success: true, user: userWithoutPassword };
      } else {
        console.error('❌ Failed to create user:', result.error);
        return { success: false, error: result.error || 'Failed to create user' };
      }
    } catch (error) {
      console.error('Google registration error:', error);
      return { success: false, error: error.message || 'Google registration failed' };
    }
  },

  async loginWithEmail(email, password) {
    try {
      const userResult = await this.getUserByEmail(email);
      
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'Invalid email or password' };
      }
      
      const user = userResult.user;
      
      if (!user.passwordHash) {
        return { success: false, error: 'Invalid email or password' };
      }
      
      const isValidPassword = await verifyPassword(password, user.passwordHash);

      if (!isValidPassword) {
        return { success: false, error: 'Invalid email or password' };
      }
      
      await userService.updateUser(user.id, { 
        lastLoginAt: new Date().toISOString() 
      });
      
      const { passwordHash: _, ...userWithoutPassword } = user;
      return { success: true, user: userWithoutPassword };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  },

  async getUserByEmail(email) {
    try {
      const params = {
        TableName: 'ziko-users',
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email.toLowerCase(),
        },
      };
      
      const result = await dynamodb.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        return { success: true, user: result.Items[0] };
      } else {
        return { success: true, user: null };
      }
    } catch (error) {
      console.error('Get user by email error:', error);
      return { success: false, error: error.message };
    }
  },

  async getUserByPhone(phoneNumber) {
    try {
      // Helper function to convert +972 format to local format (054...)
      // Handles both +9720549369402 and +972549369402 formats
      const normalizeToLocalFormat = (phone) => {
        if (!phone) return phone;
        let normalized = phone.trim();
        
        // If it starts with +9720, remove +972 (keeps the 0)
        // Example: +9720549369402 -> 0549369402
        if (normalized.startsWith('+9720')) {
          normalized = '0' + normalized.substring(5);
        }
        // If it starts with +972 (without 0), add 0
        // Example: +972549369402 -> 0549369402
        else if (normalized.startsWith('+972')) {
          normalized = '0' + normalized.substring(4);
        }
        // If it starts with 9720, add 0 at the beginning
        // Example: 9720549369402 -> 0549369402
        else if (normalized.startsWith('9720')) {
          normalized = '0' + normalized.substring(4);
        }
        // If it starts with 972 (without 0), add 0
        // Example: 972549369402 -> 0549369402
        else if (normalized.startsWith('972')) {
          normalized = '0' + normalized.substring(3);
        }
        // If it already starts with 0, return as is
        // Example: 0549369402 -> 0549369402
        else if (!normalized.startsWith('0')) {
          // If it doesn't start with 0 and is not international format, assume it's missing 0
          normalized = '0' + normalized;
        }
        
        return normalized;
      };

      // Search in multiple formats:
      // 1. The provided format (as-is)
      // 2. Local format (054...)
      // 3. International format without leading 0 (+9725...)
      const localFormat = normalizeToLocalFormat(phoneNumber);
      
      // Also try international format without 0 (in case stored that way)
      let internationalWithoutZero = phoneNumber;
      if (phoneNumber.startsWith('+9720')) {
        internationalWithoutZero = '+972' + phoneNumber.substring(5);
      }
      
      const searchFormats = [
        phoneNumber,           // Original format (e.g., +9720549369402)
        localFormat,           // Local format (e.g., 0549369402)
        internationalWithoutZero // Without leading 0 (e.g., +972549369402)
      ].filter(Boolean);
      
      // Remove duplicates
      const uniqueFormats = [...new Set(searchFormats)];
      
      console.log('🔍 Searching for phone number in formats:', uniqueFormats);
      
      // Try each format
      for (const format of uniqueFormats) {
        const params = {
          TableName: 'ziko-users',
          FilterExpression: 'phone = :phone',
          ExpressionAttributeValues: {
            ':phone': format,
          },
        };
        
        const result = await dynamodb.send(new ScanCommand(params));
        
        if (result.Items && result.Items.length > 0) {
          console.log('✅ Found user with phone format:', format);
          return { success: true, user: result.Items[0] };
        }
      }
      
      console.log('ℹ️ No user found with any phone format');
      return { success: true, user: null };
    } catch (error) {
      console.error('Get user by phone error:', error);
      return { success: false, error: error.message };
    }
  },

  async getUserByGoogleId(googleId) {
    try {
      const params = {
        TableName: 'ziko-users',
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      };
      
      const result = await dynamodb.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        return { success: true, user: result.Items[0] };
      } else {
        return { success: true, user: null };
      }
    } catch (error) {
      console.error('Get user by Google ID error:', error);
      return { success: false, error: error.message };
    }
  },

  async updateUserProfile(userId, updates) {
    try {
      const result = await userService.updateUser(userId, updates);
      
      if (result.success) {
        return { success: true, user: result.user };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Profile update failed' };
    }
  },

  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not found' };
      }

      const user = userResult.user;

      // Verify current password
      if (user.passwordHash) {
        const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
        if (!isValidPassword) {
          return { success: false, error: 'Current password is incorrect' };
        }
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      const updateResult = await userService.updateUser(userId, {
        passwordHash: newPasswordHash,
        updatedAt: new Date().toISOString(),
      });

      if (updateResult.success) {
        return { success: true, message: 'Password updated successfully' };
      } else {
        return { success: false, error: updateResult.error || 'Failed to update password' };
      }
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  },

  async getUsers({ query }) {
    try {
      // Check if query is for Google ID search (format: "google:123456")
      if (query && query.startsWith('google:')) {
        const googleId = query.replace('google:', '');
        console.log('🔍 Searching for user with Google ID:', googleId);
        const result = await this.getUserByGoogleId(googleId);
        console.log('🔍 getUserByGoogleId result:', result);
        
        // If search failed, return the error
        if (!result.success) {
          console.error('❌ Failed to search for user by Google ID:', result.error);
          return { success: false, error: result.error };
        }
        
        // Convert single user result to users array format
        if (result.user) {
          console.log('✅ User found with Google ID');
          return { success: true, users: [result.user] };
        } else {
          console.log('ℹ️ No user found with Google ID');
          return { success: true, users: [] };
        }
      }

      // Regular search by name, email, or phone
      const params = {
        TableName: 'ziko-users',
        FilterExpression:
          'contains(#name, :query) OR contains(email, :query) OR contains(phone, :query)',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':query': query.toLowerCase() },
      };
      const result = await dynamodb.send(new ScanCommand(params));
      return { success: true, users: result.Items || [] };
    } catch (error) {
      console.error('Get users (partial search) error:', error);
      return { success: false, error: error.message };
    }
  },

  // Store reset codes in memory (in production, use Redis or DynamoDB)
  resetCodeStore: new Map(),

  async requestPasswordReset(emailOrPhone) {
    try {
      // Try to find user by email first
      let user = null;
      const emailResult = await this.getUserByEmail(emailOrPhone);
      if (emailResult.success && emailResult.user) {
        user = emailResult.user;
      } else {
        // Try by phone
        const phoneResult = await this.getUserByPhone(emailOrPhone);
        if (phoneResult.success && phoneResult.user) {
          user = phoneResult.user;
        }
      }

      if (!user) {
        // Don't reveal if user exists or not for security
        return { success: true, message: 'If an account exists, a reset code will be sent' };
      }

      // Check if user has password (not Google-only user)
      if (!user.passwordHash) {
        return { success: false, error: 'This account uses Google sign-in. Password reset is not available.' };
      }

      // Generate 6-digit reset code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store reset code with 15 minute expiration
      this.resetCodeStore.set(user.id, {
        code: resetCode,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        email: user.email,
      });

      // Send reset code via SMS if phone exists, otherwise log it (email service can be added later)
      if (user.phone) {
        try {
          const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
          const AWS_CONFIG = {
            region: process.env.AWS_REGION || process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
            },
          };
          
          const AWS_ENABLED = !!((process.env.AWS_ACCESS_KEY_ID || process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID) && 
                                  (process.env.AWS_SECRET_ACCESS_KEY || process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY));
          
          if (AWS_ENABLED) {
            const snsClient = new SNSClient(AWS_CONFIG);
            const message = `Your ZIKO password reset code is: ${resetCode}. This code expires in 15 minutes.`;
            
            const params = {
              Message: message,
              PhoneNumber: user.phone,
            };
            
            await snsClient.send(new PublishCommand(params));
            console.log(`✅ Password reset code sent via SMS to ${user.phone}`);
          } else {
            console.log(`📱 Password reset code for ${user.email}: ${resetCode} (SMS not configured)`);
            return { 
              success: true, 
              message: 'Reset code generated. Check console/server logs for code.',
              resetCode: resetCode // Include in response for development
            };
          }
        } catch (smsError) {
          console.error('SMS error:', smsError);
          console.log(`📱 Password reset code for ${user.email}: ${resetCode}`);
          return { 
            success: true, 
            message: 'Reset code generated. Check console/server logs for code.',
            resetCode: resetCode // Include in response for development
          };
        }
      } else {
        // No phone number - log code for development
        console.log(`📱 Password reset code for ${user.email}: ${resetCode}`);
        return { 
          success: true, 
          message: 'Reset code generated. Check console/server logs for code.',
          resetCode: resetCode // Include in response for development
        };
      }

      return { success: true, message: 'Password reset code sent successfully' };
    } catch (error) {
      console.error('Request password reset error:', error);
      return { success: false, error: 'Failed to request password reset' };
    }
  },

  async resetPassword(emailOrPhone, resetCode, newPassword) {
    try {
      if (!resetCode || !newPassword) {
        return { success: false, error: 'Reset code and new password are required' };
      }

      if (newPassword.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters long' };
      }

      // Find user
      let user = null;
      const emailResult = await this.getUserByEmail(emailOrPhone);
      if (emailResult.success && emailResult.user) {
        user = emailResult.user;
      } else {
        const phoneResult = await this.getUserByPhone(emailOrPhone);
        if (phoneResult.success && phoneResult.user) {
          user = phoneResult.user;
        }
      }

      if (!user) {
        return { success: false, error: 'Invalid reset code or user not found' };
      }

      // Verify reset code
      const storedData = this.resetCodeStore.get(user.id);
      if (!storedData) {
        return { success: false, error: 'Invalid or expired reset code' };
      }

      // Check expiration
      if (Date.now() > storedData.expiresAt) {
        this.resetCodeStore.delete(user.id);
        return { success: false, error: 'Reset code has expired. Please request a new one.' };
      }

      // Verify code
      if (storedData.code !== resetCode) {
        return { success: false, error: 'Invalid reset code' };
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      const updateResult = await userService.updateUser(user.id, {
        passwordHash: newPasswordHash,
        updatedAt: new Date().toISOString(),
      });

      if (updateResult.success) {
        // Remove used reset code
        this.resetCodeStore.delete(user.id);
        return { success: true, message: 'Password reset successfully' };
      } else {
        return { success: false, error: updateResult.error || 'Failed to reset password' };
      }
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  },
};

module.exports = authService;

