const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { executeCloudOperation } = require('./cloudUtils');
const crypto = require('crypto');

// AWS Configuration (from environment variables, only on server!)
const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

console.log('🔧 AWS Config:', {
  region: AWS_CONFIG.region,
  hasAccessKey: !!AWS_CONFIG.credentials.accessKeyId,
  hasSecretKey: !!AWS_CONFIG.credentials.secretAccessKey,
  accessKeyPrefix: AWS_CONFIG.credentials.accessKeyId?.substring(0, 8) + '...'
});

// Initialize AWS clients
const client = new DynamoDBClient(AWS_CONFIG);
const dynamodb = DynamoDBDocumentClient.from(client);

const s3Client = new S3Client(AWS_CONFIG);
const s3 = s3Client;

// DynamoDB Table Names
const TABLES = {
  USERS: 'ziko-users',
  GIFT_CARDS: 'ziko-gift-cards',
  TRANSACTIONS: 'ziko-transactions',
  MARKETPLACE: 'ziko-marketplace',
  NOTIFICATIONS: 'ziko-notifications',
  FRIENDS: 'ziko-friends',
  SHARED_GIFTCARDS: 'ziko-shared-giftcards',
};

// S3 Bucket Names
const BUCKETS = {
  GIFT_CARD_IMAGES: 'ziko-gift-card-images',
  USER_PROFILES: 'ziko-user-profiles',
};

// User Operations
const userService = {
  async createUser(userData) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.USERS,
          Item: {
            ...userData, 
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
        await dynamodb.send(new PutCommand(params));
        console.log('✅ User saved:', params.Item.id);
        return { user: params.Item };
      },
      'create user'
    );
  },

  async getUserById(userId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.USERS,
          Key: { id: userId },
        };
        const result = await dynamodb.send(new GetCommand(params));
        return { user: result.Item };
      },
      'get user'
    );
  },

  async updateUser(userId, updates) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.USERS,
          Key: { id: userId },
          UpdateExpression: 'SET #updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
          ReturnValues: 'ALL_NEW',
        };
        Object.keys(updates).forEach((key) => {
          params.UpdateExpression += `, #${key} = :${key}`;
          params.ExpressionAttributeNames[`#${key}`] = key;
          params.ExpressionAttributeValues[`:${key}`] = updates[key];
        });
        const result = await dynamodb.send(new UpdateCommand(params));
        return { user: result.Attributes };
      },
      'update user'
    );
  },

  async deleteUser(userId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.USERS,
          Key: { id: userId },
        };
        await dynamodb.send(new DeleteCommand(params));
        return {};
      },
      'delete user'
    );
  },
};

// Gift Card Operations
const giftCardService = {
  async createGiftCard(cardData) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.GIFT_CARDS,
          Item: {
            id: cardData.id,
            userId: cardData.userId,
            storeName: cardData.storeName,
            amount: cardData.amount,
            expiryDate: cardData.expiryDate,
            imageUrl: cardData.imageUrl || null,
            cardNumber: cardData.cardNumber || null,
            pin: cardData.pin || null,
            status: cardData.status || 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
        await dynamodb.send(new PutCommand(params));
        return { card: params.Item };
      },
      'create gift card'
    );
  },

  async getUserGiftCards(userId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.GIFT_CARDS,
          FilterExpression: 'userId = :userId',
          ExpressionAttributeValues: { ':userId': userId },
        };
        const result = await dynamodb.send(new ScanCommand(params));
        return { cards: result.Items || [] };
      },
      'get user gift cards'
    );
  },

  async getGiftCardById(cardId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.GIFT_CARDS,
          Key: { id: cardId },
        };
        const result = await dynamodb.send(new GetCommand(params));
        return { card: result.Item };
      },
      'get gift card by id'
    );
  },

  async updateGiftCard(cardId, updates) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.GIFT_CARDS,
          Key: { id: cardId },
          UpdateExpression: 'SET #updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':updatedAt': new Date().toISOString() },
          ReturnValues: 'ALL_NEW',
        };
        Object.keys(updates).forEach((key) => {
          params.UpdateExpression += `, #${key} = :${key}`;
          params.ExpressionAttributeNames[`#${key}`] = key;
          params.ExpressionAttributeValues[`:${key}`] = updates[key];
        });
        const result = await dynamodb.send(new UpdateCommand(params));
        return { card: result.Attributes };
      },
      'update gift card'
    );
  },

  async deleteGiftCard(cardId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.GIFT_CARDS,
          Key: { id: cardId },
        };
        await dynamodb.send(new DeleteCommand(params));
        return {};
      },
      'delete gift card'
    );
  },
};

// Marketplace Operations
const marketplaceService = {
  async listGiftCard(cardData) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.MARKETPLACE,
          Item: {
            id: cardData.id,
            sellerId: cardData.sellerId,
            sellerName: cardData.sellerName,
            storeName: cardData.storeName,
            amount: cardData.amount,
            price: cardData.price,
            expiryDate: cardData.expiryDate,
            imageUrl: cardData.imageUrl || null,
            status: 'available',
            listedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        };
        await dynamodb.send(new PutCommand(params));
        return { listing: params.Item };
      },
      'list gift card'
    );
  },

  async getMarketplaceListings(filters = {}) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.MARKETPLACE,
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'available' },
        };
        if (filters.storeName) {
          params.FilterExpression += ' AND contains(storeName, :storeName)';
          params.ExpressionAttributeValues[':storeName'] = filters.storeName;
        }
        if (filters.minPrice) {
          params.FilterExpression += ' AND price >= :minPrice';
          params.ExpressionAttributeValues[':minPrice'] = filters.minPrice;
        }
        if (filters.maxPrice) {
          params.FilterExpression += ' AND price <= :maxPrice';
          params.ExpressionAttributeValues[':maxPrice'] = filters.maxPrice;
        }
        const result = await dynamodb.send(new ScanCommand(params));
        return { listings: result.Items || [] };
      },
      'get marketplace listings'
    );
  },

  async purchaseGiftCard(listingId, buyerId) {
    return executeCloudOperation(
      async () => {
        const transactionParams = {
          TransactItems: [
            {
              Update: {
                TableName: TABLES.MARKETPLACE,
                Key: { id: listingId },
                UpdateExpression: 'SET #status = :status, buyerId = :buyerId, purchasedAt = :purchasedAt',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':status': 'sold',
                  ':buyerId': buyerId,
                  ':purchasedAt': new Date().toISOString(),
                  ':availableStatus': 'available',
                },
                ConditionExpression: '#status = :availableStatus',
              },
            },
            {
              Put: {
                TableName: TABLES.TRANSACTIONS,
                Item: {
                  id: `txn_${Date.now()}`,
                  listingId,
                  buyerId,
                  type: 'purchase',
                  amount: 0,
                  createdAt: new Date().toISOString(),
                },
              },
            },
          ],
        };
        await dynamodb.send(new TransactWriteCommand(transactionParams));
        return {};
      },
      'purchase gift card'
    );
  },
};

// S3 Operations
const s3Service = {
  async uploadGiftCardImage(imageBuffer, cardId, imageType = 'jpg') {
    return executeCloudOperation(
      async () => {
        const key = `gift-cards/${cardId}/${Date.now()}.${imageType}`;
        const params = {
          Bucket: BUCKETS.GIFT_CARD_IMAGES,
          Key: key,
          Body: imageBuffer,
          ContentType: `image/${imageType}`,
        };
        await s3.send(new PutObjectCommand(params));
        const imageUrl = `https://${BUCKETS.GIFT_CARD_IMAGES}.s3.${AWS_CONFIG.region}.amazonaws.com/${key}`;
        console.log('✅ Image uploaded to S3:', imageUrl);
        return { url: imageUrl };
      },
      'upload gift card image'
    );
  },

  async getPresignedUploadUrl(cardId, imageType = 'jpg') {
    return executeCloudOperation(
      async () => {
        const key = `gift-cards/${cardId}/${Date.now()}.${imageType}`;
        const command = new PutObjectCommand({
          Bucket: BUCKETS.GIFT_CARD_IMAGES,
          Key: key,
          ContentType: `image/${imageType}`,
        });
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return { url: signedUrl, key };
      },
      'get presigned upload url'
    );
  },

  async deleteImage(bucket, key) {
    return executeCloudOperation(
      async () => {
        const params = { Bucket: bucket, Key: key };
        await s3.send(new DeleteObjectCommand(params));
        return {};
      },
      'delete image'
    );
  },
};

// Notification Operations
const notificationService = {
  async createNotification(notificationData) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.NOTIFICATIONS,
          Item: {
            id: notificationData.id,
            userId: notificationData.userId,
            type: notificationData.type,
            title: notificationData.title,
            message: notificationData.message,
            data: notificationData.data || {},
            read: false,
            createdAt: new Date().toISOString(),
          },
        };
        await dynamodb.send(new PutCommand(params));
        return { notification: params.Item };
      },
      'create notification'
    );
  },

  async getUserNotifications(userId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.NOTIFICATIONS,
          FilterExpression: 'userId = :userId',
          ExpressionAttributeValues: { ':userId': userId },
        };
        const result = await dynamodb.send(new ScanCommand(params));
        return { notifications: result.Items || [] };
      },
      'get user notifications'
    );
  },

  async markNotificationAsRead(notificationId) {
    return executeCloudOperation(
      async () => {
        const params = {
          TableName: TABLES.NOTIFICATIONS,
          Key: { id: notificationId },
          UpdateExpression: 'SET #read = :read',
          ExpressionAttributeNames: { '#read': 'read' },
          ExpressionAttributeValues: { ':read': true },
        };
        await dynamodb.send(new UpdateCommand(params));
        return {};
      },
      'mark notification as read'
    );
  },
};

module.exports = {
  dynamodb,
  s3,
  TABLES,
  BUCKETS,
  userService,
  giftCardService,
  marketplaceService,
  s3Service,
  notificationService,
};

