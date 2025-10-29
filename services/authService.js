const { userService, dynamodb } = require('./aws');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const PASSWORD_SALT = process.env.PASSWORD_SALT || 'ziko-default-salt-2024';

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password + PASSWORD_SALT).digest('hex');
};

const verifyPassword = (password, hash) => {
  const hashedPassword = hashPassword(password);
  return hashedPassword === hash;
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
      const passwordHash = hashPassword(password);
      
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

  async loginWithEmail(email, password) {
    try {
      const userResult = await this.getUserByEmail(email);
      
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'Invalid email or password' };
      }
      
      const user = userResult.user;
      
      const isValidPassword = verifyPassword(password, user.passwordHash);

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
      const params = {
        TableName: 'ziko-users',
        FilterExpression: 'phone = :phone',
        ExpressionAttributeValues: {
          ':phone': phoneNumber,
        },
      };
      
      const result = await dynamodb.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        return { success: true, user: result.Items[0] };
      } else {
        return { success: true, user: null };
      }
    } catch (error) {
      console.error('Get user by phone error:', error);
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

  async getUsers({ query }) {
    try {
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
};

module.exports = authService;

