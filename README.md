# Profile Management API with NLQ

A powerful Node.js REST API for managing and classifying person profiles. It automatically enriches name-based data with gender, age, and nationality information using external APIs and provides a core Natural Language Query (NLQ) engine powered by Gemini.

## 🚀 Key Features

### 1. Automatic Profile Classification

When you provide a name, the API consults three upstream services:

- **Genderize.io**: To predict gender and confidence score.
- **Agify.io**: To predict age and classify into age groups (child, teenager, adult, senior).
- **Nationalize.io**: To predict the most likely country of origin.

### 2. Advanced Query System

The `GET /api/profiles` endpoint is equipped with robust data retrieval capabilities:

- **Filtering**: Filter by `gender`, `country_id`, or `age_group`.
- **Sorting**: Sort results by any field (e.g., `age`, `name`, `created_at`) in `asc` or `desc` order.
- **Pagination**: Efficiently handle large datasets using `page` and `limit` parameters.

### 3. Natural Language Query (NLQ)

Search your database using plain English. By adding a `q` parameter to your GET request, the API uses **Gemini 1.5 Flash** to translate your prompt into a structured MongoDB query.

- *Example*: `GET /api/profiles?q=women from Nigeria older than 30`

### 4. Robust Persistence

- **MongoDB**: All profiles are stored in a MongoDB collection.
- **UUID v7**: Profiles use time-sortable UUID v7 identifiers for primary keys.
- **Data Enrichment**: Automatically maps country ISO codes (e.g., "NG") to full country names (e.g., "Nigeria") using `i18n-iso-countries`.

---

## 🛠️ API Reference

### Create/Lookup Profile

`POST /api/profiles`

- **Body**: `{ "name": "Kesiena" }`
- **Behavior**: If the profile already exists, it returns it. Otherwise, it classifies the name and persists a new profile.

### List Profiles

`GET /api/profiles`

- **Query Params**:
  - `q`: Natural language search string.
  - `page`: Page number (default: 1).
  - `limit`: Results per page (default: 10).
  - `sortBy`: Field to sort by (default: `created_at`).
  - `order`: `asc` or `desc` (default: `desc`).
  - `gender`: Filter by gender.
  - `country_id`: Filter by ISO country code.
  - `age_group`: Filter by child, teenager, adult, or senior.

### Get Single Profile

`GET /api/profiles/:id`

- **Parameters**: `:id` can be a UUID or a name.

### Delete Profile

`DELETE /api/profiles/:id`

- **Parameters**: `:id` (UUID).

---

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
PORT=5500
MONGO_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_google_ai_apiKey
```

---

## 📦 Installation & Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Run Development Server**:

   ```bash
   npm run dev
   ```

3. **Run Production Server**:

   ```bash
   npm start
   ```

## 🏗️ Technology Stack

- **Server**: Express.js (ES Modules)
- **Database**: MongoDB & Mongoose
- **AI**: Google Generative AI (@google/generative-ai)
- **Utilities**: Axios, UUID v7, i18n-iso-countries
