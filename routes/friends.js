const express = require('express');
const router = express.Router();
const { friendService, sharedGiftCardService } = require('../services/friendService');

router.get('/:userId', async (req, res) => {
  try {
    const result = await friendService.getFriends(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId/pending', async (req, res) => {
  try {
    const result = await friendService.getPendingRequests(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/request', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    const result = await friendService.sendFriendRequest(userId, friendId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    const result = await friendService.acceptFriend(userId, friendId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:userId/:friendId', async (req, res) => {
  try {
    const result = await friendService.removeFriend(req.params.userId, req.params.friendId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/share-giftcard', async (req, res) => {
  try {
    const { fromUserId, toUserId, giftCardId, shareType } = req.body;
    const result = await sharedGiftCardService.shareGiftCard({
      fromUserId,
      toUserId,
      giftCardId,
      shareType,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/shared/received/:userId', async (req, res) => {
  try {
    const result = await sharedGiftCardService.getReceivedGiftCards(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/shared/sent/:userId', async (req, res) => {
  try {
    const result = await sharedGiftCardService.getSentGiftCards(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

