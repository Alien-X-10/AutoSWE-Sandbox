
import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from './db.js';

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
    try {
        const { name, identifier, password } = req.body;

        if (!name?.trim() || !identifier?.trim() || !password) {
            return res.status(400).json({
                error: 'Name, email, and password are required.',
            });
        }

        const email = identifier.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                error: 'Please enter a valid email address.',
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long.',
            });
        }

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rowCount > 0) {
            return res.status(409).json({
                error: 'An account with this email already exists.',
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, created_at`,
            [name.trim(), email, passwordHash]
        );

        return res.status(201).json({
            message: 'Account created successfully. Please sign in.',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Registration error:', error.message);
        return res.status(500).json({
            error: 'Unable to create account right now.',
        });
    }
});

// Log in an existing user
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier?.trim() || !password) {
            return res.status(400).json({
                error: 'Email and password are required.',
            });
        }

        const email = identifier.trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, name, email, password_hash
             FROM users
             WHERE email = $1`,
            [email]
        );

        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                error: 'Invalid email or password.',
            });
        }

        // Session/token handling will be added in a later step.
       req.session.userId = user.id;

req.session.save((error) => {
    if (error) {
        console.error('Session save error:', error.message);

        return res.status(500).json({
            error: 'Unable to establish a session.',
        });
    }

    return res.status(200).json({
        message: 'Login successful.',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
    });
});
    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({
            error: 'Unable to sign in right now.',
        });
    }
});


// Get the currently authenticated user
router.get('/me', async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({
            error: 'Not authenticated.',
        });
    }

    try {
        const result = await pool.query(
            'SELECT id, name, email FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({
                error: 'User account not found.',
            });
        }

        return res.status(200).json({
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Current user lookup error:', error.message);

        return res.status(500).json({
            error: 'Unable to retrieve the current user.',
        });
    }
});

// Log out the current user
router.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Logout error:', error.message);

            return res.status(500).json({
                error: 'Unable to log out right now.',
            });
        }

        res.clearCookie('connect.sid', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return res.status(200).json({
            message: 'Logged out successfully.',
        });
    });
});

export default router;
