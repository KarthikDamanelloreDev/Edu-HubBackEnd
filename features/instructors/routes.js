const express = require('express');
const router = express.Router();
const {
    createInstructor,
    getAllInstructors,
    getInstructor,
    updateInstructor,
    deleteInstructor
} = require('./services');
const { validateInstructor } = require('./validations');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');

// Create Instructor
router.post('/', async (req, res) => {
    try {
        const errors = validateInstructor(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const instructor = await createInstructor(req.body);
        res.status(CREATED).json(instructor);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Get All Instructors
router.get('/', async (req, res) => {
    try {
        const instructors = await getAllInstructors();
        res.status(OK).json(instructors);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Get Single Instructor
router.get('/:id', async (req, res) => {
    try {
        const instructor = await getInstructor(req.params.id);
        res.status(OK).json(instructor);
    } catch (err) {
        if (err.message === 'Instructor not found') {
            return res.status(NOT_FOUND).json({ message: 'Instructor not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Update Instructor
router.put('/:id', async (req, res) => {
    try {
        const instructor = await updateInstructor(req.params.id, req.body);
        res.status(OK).json(instructor);
    } catch (err) {
        if (err.message === 'Instructor not found') {
            return res.status(NOT_FOUND).json({ message: 'Instructor not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Delete Instructor
router.delete('/:id', async (req, res) => {
    try {
        const result = await deleteInstructor(req.params.id);
        res.status(OK).json(result);
    } catch (err) {
        if (err.message === 'Instructor not found') {
            return res.status(NOT_FOUND).json({ message: 'Instructor not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;