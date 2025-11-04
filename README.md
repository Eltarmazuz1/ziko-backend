# ZIKO Backend API Server

שרת Backend עבור אפליקציית ZIKO Gift Cards.

## התקנה והרצה מקומית (Local Development)

### דרישות מוקדמות
- Node.js (v16 ומעלה)
- npm או yarn
- AWS Account עם DynamoDB ו-S3 מוגדרים

### הוראות התקנה

1. **התקן dependencies:**
   ```bash
   cd backend/app
   npm install
   ```

2. **צור קובץ `.env`:**
   ```bash
   cp .env.example .env
   ```

3. **עדכן את `.env` עם ה-credentials שלך:**
   ```env
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-access-key-here
   AWS_SECRET_ACCESS_KEY=your-secret-key-here
   PORT=3001
   ```

4. **הרץ את השרת:**
   ```bash
   npm start
   ```

השרת ירוץ על `http://localhost:3001`

### בדיקת Health
```bash
curl http://localhost:3001/api/health
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - הרשמה
- `POST /api/auth/login` - התחברות
- `POST /api/auth/search-users` - חיפוש משתמשים
- `GET /api/auth/user/:userId` - קבלת משתמש
- `PUT /api/auth/profile/:userId` - עדכון פרופיל

### Gift Cards
- `GET /api/giftcards/:userId` - כל כרטיסי המשתמש
- `GET /api/giftcards/card/:cardId` - כרטיס ספציפי
- `POST /api/giftcards` - יצירת כרטיס חדש
- `PUT /api/giftcards/:cardId` - עדכון כרטיס
- `DELETE /api/giftcards/:cardId` - מחיקת כרטיס

### Friends
- `GET /api/friends/:userId` - רשימת חברים
- `GET /api/friends/:userId/pending` - בקשות ממתינות
- `POST /api/friends/request` - שליחת בקשה
- `POST /api/friends/accept` - אישור בקשה
- `DELETE /api/friends/:userId/:friendId` - מחיקת חבר
- `POST /api/friends/share-giftcard` - שיתוף כרטיס
- `GET /api/friends/shared/received/:userId` - כרטיסים ששותפו איתך
- `GET /api/friends/shared/sent/:userId` - כרטיסים ששיתפת

### Marketplace
- `GET /api/marketplace` - רשימת כרטיסים למכירה
- `POST /api/marketplace/list` - פרסום כרטיס למכירה
- `POST /api/marketplace/purchase` - קניית כרטיס



