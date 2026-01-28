const express = require('express');
const router = express.Router();
const { getStudentProfile } = require('./services');
const { OK, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');

// Get Student Profile & Dashboard Data
router.get('/profile', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const profileData = await getStudentProfile(userId);
        res.status(OK).json(profileData);
    } catch (err) {
        if (err.message === 'User not found') {
            return res.status(NOT_FOUND).json({ message: 'User not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;