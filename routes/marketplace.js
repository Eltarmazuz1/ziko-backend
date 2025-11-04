const express = require('express');
const router = express.Router();
const { marketplaceService } = require('../services/aws');

router.get('/', async (req, res) => {
  try {
    const filters = req.query;
    const result = await marketplaceService.getMarketplaceListings(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/list', async (req, res) => {
  try {
    const result = await marketplaceService.listGiftCard(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/purchase', async (req, res) => {
  try {
    const { listingId, buyerId } = req.body;
    const result = await marketplaceService.purchaseGiftCard(listingId, buyerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/unlist/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { sellerId } = req.body;
    
    if (!sellerId) {
      return res.status(400).json({ success: false, error: 'sellerId is required' });
    }
    
    const result = await marketplaceService.unlistGiftCard(listingId, sellerId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

