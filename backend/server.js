const express = require('express');
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
 

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
//app.use(cors());
app.use(cors({
  origin: "*",
  allowedHeaders: ["Authorization", "Content-Type"]
}));
app.use(express.json());

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Opportunity Tracker API',
      version: '1.0.0',
      description: 'API for tracking opportunities with status management',
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Development server' },
        {url:'https://track-opportunities.onrender.com',description: 'Production Server'}
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./server.js'],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};


/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *     Opportunity:
 *       type: object
 *       required:
 *         - title
 *         - category
 *         - deadline
 *       properties:
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         category:
 *           type: string
 *           enum: [scholarship, graduate_school, conference, other]
 *         deadline:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [pending, submitted, interview, offered, rejected]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists or invalid data
 */
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const snapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    if (snapshot.exists()) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserRef = db.ref('users').push();
    await newUserRef.set({
      email,
      password: hashedPassword,
      createdAt: Date.now(),
    });

    const token = jwt.sign({ userId: newUserRef.key, email }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, userId: newUserRef.key });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const snapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    if (!snapshot.exists()) return res.status(401).json({ error: 'Invalid credentials' });

    const userId = Object.keys(snapshot.val())[0];
    const userData = snapshot.val()[userId];

    const validPassword = await bcrypt.compare(password, userData.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, userId });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/opportunities:
 *   get:
 *     summary: Get all opportunities for authenticated user
 *     tags: [Opportunities]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of opportunities
 *   post:
 *     summary: Create a new opportunity
 *     tags: [Opportunities]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Opportunity'
 *     responses:
 *       201:
 *         description: Opportunity created successfully
 */
app.get('/api/opportunities', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.ref('opportunities').orderByChild('userId').equalTo(req.user.userId).once('value');
    let opportunities = [];

    if (snapshot.exists()) {
      opportunities = Object.entries(snapshot.val()).map(([id, data]) => ({
        id,
        ...data,
      }));

      const { status, category } = req.query;
      if (status) opportunities = opportunities.filter(o => o.status === status);
      if (category) opportunities = opportunities.filter(o => o.category === category);

      opportunities.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    }

    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/api/opportunities', authenticateToken, async (req, res) => {
  try {
    const { title, description = '', category, deadline } = req.body;
    if (!title || !category || !deadline) return res.status(400).json({ error: 'Missing fields' });

    const newRef = db.ref('opportunities').push();
    const opportunity = {
      title,
      description,
      category,
      deadline,
      status: 'pending',
      userId: req.user.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await newRef.set(opportunity);
    res.status(201).json({ id: newRef.key, ...opportunity });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/opportunities/{id}:
 *   get:
 *     summary: Get opportunity by ID
 *     tags: [Opportunities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Opportunity details
 *       404:
 *         description: Opportunity not found
 *   put:
 *     summary: Update opportunity
 *     tags: [Opportunities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Opportunity'
 *     responses:
 *       200:
 *         description: Opportunity updated successfully
 *   delete:
 *     summary: Delete opportunity
 *     tags: [Opportunities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Opportunity deleted successfully
 */
app.get('/api/opportunities/:id', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.ref(`opportunities/${req.params.id}`).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Opportunity not found' });

    const data = snapshot.val();
    if (data.userId !== req.user.userId) return res.status(403).json({ error: 'Access denied' });

    res.json({ id: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/opportunities/:id', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.ref(`opportunities/${req.params.id}`).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Opportunity not found' });

    const data = snapshot.val();
    if (data.userId !== req.user.userId) return res.status(403).json({ error: 'Access denied' });

    const updates = {
      updatedAt: Date.now(),
      ...req.body,
    };
    await db.ref(`opportunities/${req.params.id}`).update(updates);
    res.json({ message: 'Opportunity updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});



app.delete('/api/opportunities/:id', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.ref(`opportunities/${req.params.id}`).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Opportunity not found' });

    const data = snapshot.val();
    if (data.userId !== req.user.userId) return res.status(403).json({ error: 'Access denied' });

    await db.ref(`opportunities/${req.params.id}`).remove();
    res.json({ message: 'Opportunity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get opportunity statistics
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Statistics data
 */
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.ref('opportunities').orderByChild('userId').equalTo(req.user.userId).once('value');
    const stats = {
      total: 0,
      pending: 0,
      submitted: 0,
      interview: 0,
      offered: 0,
      rejected: 0,
      byCategory: {
        scholarship: 0,
        graduate_school: 0,
        conference: 0,
        other: 0,
      },
    };

    if (snapshot.exists()) {
      Object.values(snapshot.val()).forEach(data => {
        stats.total++;
        stats[data.status]++;
        stats.byCategory[data.category]++;
      });
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});