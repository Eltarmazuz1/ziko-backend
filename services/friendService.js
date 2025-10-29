const { dynamodb } = require('./aws');
const { v4: uuidv4 } = require('uuid');
const { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const FRIENDS_TABLE = process.env.FRIENDS_TABLE || 'ziko-friends';
const SHARED_TABLE = process.env.SHARED_GIFTCARDS_TABLE || 'ziko-shared-giftcards';

const friendService = {
  async sendFriendRequest(userId, friendId) {
    const item = {
      userId,
      friendId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      requestedBy: userId,
    };
    const params = {
      TableName: FRIENDS_TABLE,
      Item: item,
    };
    await dynamodb.send(new PutCommand(params));
    return { success: true, friend: item };
  },

  async acceptFriend(userId, friendId) {
    const params = {
      TableName: FRIENDS_TABLE,
      Key: { userId, friendId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'accepted' },
      ReturnValues: 'ALL_NEW',
    };
    const result = await dynamodb.send(new UpdateCommand(params));
    return { success: true, friend: result.Attributes };
  },

  async removeFriend(userId, friendId) {
    const params = {
      TableName: FRIENDS_TABLE,
      Key: { userId, friendId },
    };
    await dynamodb.send(new DeleteCommand(params));
    return { success: true };
  },

  async getFriends(userId) {
    const params1 = {
      TableName: FRIENDS_TABLE,
      FilterExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':userId': userId, ':status': 'accepted' },
    };
    const params2 = {
      TableName: FRIENDS_TABLE,
      FilterExpression: 'friendId = :userId AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':userId': userId, ':status': 'accepted' },
    };
    const [res1, res2] = await Promise.all([
      dynamodb.send(new ScanCommand(params1)),
      dynamodb.send(new ScanCommand(params2)),
    ]);
    const friendsA = (res1.Items || []).map(f => ({...f, otherUserId: f.friendId}));
    const friendsB = (res2.Items || []).map(f => ({...f, otherUserId: f.userId}));
    const all = [...friendsA, ...friendsB];
    return { success: true, friends: all };
  },

  async getPendingRequests(userId) {
    const params = {
      TableName: FRIENDS_TABLE,
      FilterExpression: 'friendId = :userId AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':userId': userId, ':status': 'pending' },
    };
    const result = await dynamodb.send(new ScanCommand(params));
    return { success: true, requests: result.Items || [] };
  },
};

const sharedGiftCardService = {
  async shareGiftCard({ fromUserId, toUserId, giftCardId, shareType }) {
    const item = {
      id: uuidv4(),
      fromUserId,
      toUserId,
      giftCardId,
      shareType,
      createdAt: new Date().toISOString(),
    };
    const params = {
      TableName: SHARED_TABLE,
      Item: item,
    };
    await dynamodb.send(new PutCommand(params));
    return { success: true, shared: item };
  },

  async getReceivedGiftCards(userId) {
    const params = {
      TableName: SHARED_TABLE,
      FilterExpression: 'toUserId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    };
    const result = await dynamodb.send(new ScanCommand(params));
    return { success: true, sharedCards: result.Items || [] };
  },

  async getSentGiftCards(userId) {
    const params = {
      TableName: SHARED_TABLE,
      FilterExpression: 'fromUserId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    };
    const result = await dynamodb.send(new ScanCommand(params));
    return { success: true, sharedCards: result.Items || [] };
  },
};

module.exports = { friendService, sharedGiftCardService };

