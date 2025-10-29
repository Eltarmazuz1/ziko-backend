const express = require('express');
const router = express.Router();
const { giftCardService, s3Service } = require('../services/aws');

router.get('/:userId', async (req, res) => {
  try {
    const result = await giftCardService.getUserGiftCards(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/card/:cardId', async (req, res) => {
  try {
    const result = await giftCardService.getGiftCardById(req.params.cardId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await giftCardService.createGiftCard(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:cardId', async (req, res) => {
  try {
    const result = await giftCardService.updateGiftCard(req.params.cardId, req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:cardId', async (req, res) => {
  try {
    const result = await giftCardService.deleteGiftCard(req.params.cardId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get presigned URL for uploading image (client uploads directly to S3)
router.post('/presigned-url', async (req, res) => {
  try {
    const { cardId, imageType = 'jpg' } = req.body;
    
    if (!cardId) {
      return res.status(400).json({ success: false, error: 'Missing cardId' });
    }

    const result = await s3Service.getPresignedUploadUrl(cardId, imageType);
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting presigned URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

