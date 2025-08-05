const express = require('express');
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const nodemailer = require('nodemailer');

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

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

// Middleware
//TO DO
app.use(cors());
/*
app.use(cors({
  origin: "*",
  allowedHeaders: ["Authorization", "Content-Type"]
}));
*/
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

// Email template function
const generateEmailTemplate = (userName, opportunities) => {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysUntilDeadline = (deadline) => {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const opportunityRows = opportunities.map(opp => {
    const daysLeft = getDaysUntilDeadline(opp.deadline);
    const urgencyClass = daysLeft <= 2 ? 'urgent' : daysLeft <= 5 ? 'warning' : 'normal';
    
    return `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #e0e0e0;">
          <div>
            <h3 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 18px;">${opp.title}</h3>
            <p style="margin: 0 0 8px 0; color: #7f8c8d; font-size: 14px;">${opp.description || 'No description provided'}</p>
            <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
              <span style="background: #3498db; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; text-transform: uppercase;">
                ${opp.category.replace('_', ' ')}
              </span>
              <span class="${urgencyClass}" style="font-weight: bold; font-size: 14px; 
                color: ${urgencyClass === 'urgent' ? '#e74c3c' : urgencyClass === 'warning' ? '#f39c12' : '#27ae60'};">
                ${daysLeft === 0 ? 'Due Today!' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
              </span>
              <span style="color: #95a5a6; font-size: 13px;">Due: ${formatDate(opp.deadline)}</span>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Opportunity Deadline Reminder</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f8f9fa;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 300;
            }
            .header p {
                margin: 10px 0 0 0;
                opacity: 0.9;
                font-size: 16px;
            }
            .content {
                padding: 0;
            }
            .greeting {
                padding: 30px;
                background: #f8f9fa;
                border-bottom: 1px solid #e0e0e0;
            }
            .greeting h2 {
                margin: 0 0 10px 0;
                color: #2c3e50;
                font-size: 22px;
            }
            .greeting p {
                margin: 0;
                color: #7f8c8d;
                font-size: 16px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            .footer {
                padding: 30px;
                background: #2c3e50;
                color: white;
                text-align: center;
            }
            .footer p {
                margin: 0;
                opacity: 0.8;
            }
            .cta-button {
                display: inline-block;
                background: #3498db;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
                transition: background 0.3s;
            }
            .cta-button:hover {
                background: #2980b9;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 5px;
                }
                .header, .greeting, .footer {
                    padding: 20px;
                }
                .header h1 {
                    font-size: 24px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⏰ Deadline Reminder</h1>
                <p>Your opportunities need attention</p>
            </div>
            
            <div class="content">
                <div class="greeting">
                    <h2>Hello ${userName}!</h2>
                    <p>You have ${opportunities.length} pending ${opportunities.length === 1 ? 'opportunity' : 'opportunities'} with upcoming deadlines. Don't let these slip by!</p>
                </div>
                
                <table>
                    ${opportunityRows}
                </table>
                
                <div style="padding: 30px; text-align: center; background: #f8f9fa;">
                    <p style="margin: 0 0 20px 0; color: #7f8c8d;">Ready to take action on your opportunities?</p>
                    <a href="https://track-opportunities.onrender.com" class="cta-button">View Dashboard</a>
                </div>
            </div>
            
            <div class="footer">
                <p>© 2025 Opportunity Tracker. Keep chasing your dreams! 🚀</p>
                <p style="font-size: 12px; margin-top: 10px;">This is an automated reminder. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;
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
 *           enum: [scholarship, graduate_school, conference, internship, job, other]
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
        internship: 0,
        job: 0,
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

/**
 * @swagger
 * /api/send-deadline-reminders:
 *   post:
 *     summary: Send email reminders for pending opportunities with deadlines within a week
 *     tags: [Email Reminders]
 *     responses:
 *       200:
 *         description: Reminders sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 emailsSent:
 *                   type: number
 *                 usersNotified:
 *                   type: number
 *       500:
 *         description: Server error
 */
app.post('/api/send-deadline-reminders', async (req, res) => {
  try {
    const today = new Date();
    const oneWeekFromNow = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000));
    
    // Get all opportunities
    const opportunitiesSnapshot = await db.ref('opportunities').once('value');
    if (!opportunitiesSnapshot.exists()) {
      return res.json({ message: 'No opportunities found', emailsSent: 0, usersNotified: 0 });
    }

    // Get all users
    const usersSnapshot = await db.ref('users').once('value');
    if (!usersSnapshot.exists()) {
      return res.json({ message: 'No users found', emailsSent: 0, usersNotified: 0 });
    }

    const opportunities = opportunitiesSnapshot.val();
    const users = usersSnapshot.val();

    // Group opportunities by user and filter for pending ones with deadlines within a week
    const userOpportunities = {};
    
    Object.entries(opportunities).forEach(([oppId, oppData]) => {
      if (oppData.status === 'pending') {
        const deadlineDate = new Date(oppData.deadline);
        
        // Check if deadline is within the next week and not in the past
        if (deadlineDate >= today && deadlineDate <= oneWeekFromNow) {
          if (!userOpportunities[oppData.userId]) {
            userOpportunities[oppData.userId] = [];
          }
          userOpportunities[oppData.userId].push({
            id: oppId,
            ...oppData
          });
        }
      }
    });

    let emailsSent = 0;
    const emailPromises = [];

    // Send emails to users who have pending opportunities with upcoming deadlines
    Object.entries(userOpportunities).forEach(([userId, userOpps]) => {
      const user = users[userId];
      if (user && user.email && userOpps.length > 0) {
        const userName = user.email.split('@')[0]; // Use email prefix as name
        const htmlContent = generateEmailTemplate(userName, userOpps);
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: `⏰ ${userOpps.length} Opportunity Deadline${userOpps.length > 1 ? 's' : ''} Approaching!`,
          html: htmlContent
        };

        const emailPromise = transporter.sendMail(mailOptions)
          .then(() => {
            console.log(`Reminder email sent to ${user.email}`);
            emailsSent++;
          })
          .catch((error) => {
            console.error(`Failed to send email to ${user.email}:`, error);
          });

        emailPromises.push(emailPromise);
      }
    });

    // Wait for all emails to be sent
    await Promise.all(emailPromises);

    res.json({
      message: 'Deadline reminders processed successfully',
      emailsSent,
      usersNotified: Object.keys(userOpportunities).length
    });

  } catch (error) {
    console.error('Error sending deadline reminders:', error);
    res.status(500).json({ error: 'Failed to send deadline reminders' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});