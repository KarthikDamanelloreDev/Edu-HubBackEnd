const express = require('express');
const router = express.Router();
const {
    createCourse,
    getAllCourses,
    getCourse,
    updateCourse,
    deleteCourse,
    getCoursesCategories
} = require('./services');
const { validateCourse } = require('./validations');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');

// Create Course
router.post('/', async (req, res) => {
    try {
        const errors = validateCourse(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const course = await createCourse(req.body);
        res.status(CREATED).json(course);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Get All Courses (with pagination/search/filter)
router.get('/', async (req, res) => {
    try {
        const result = await getAllCourses(req.query);
        res.status(OK).json(result);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Get Categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await getCoursesCategories();
        res.status(OK).json(categories);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Get Single Course (by ID or Slug)
router.get('/:id', async (req, res) => {
    try {
        const course = await getCourse(req.params.id);
        res.status(OK).json(course);
    } catch (err) {
        if (err.message === 'Course not found') {
            return res.status(NOT_FOUND).json({ message: 'Course not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Edit Course
router.put('/:id', async (req, res) => {
    try {
        const course = await updateCourse(req.params.id, req.body);
        res.status(OK).json(course);
    } catch (err) {
        if (err.message === 'Course not found') {
            return res.status(NOT_FOUND).json({ message: 'Course not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Delete Course
router.delete('/:id', async (req, res) => {
    try {
        const result = await deleteCourse(req.params.id);
        res.status(OK).json(result);
    } catch (err) {
        if (err.message === 'Course not found') {
            return res.status(NOT_FOUND).json({ message: 'Course not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;