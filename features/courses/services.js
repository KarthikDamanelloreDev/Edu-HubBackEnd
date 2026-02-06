const Course = require('./schema');
const Instructor = require('../instructors/schema');

// Create a new course
const createCourse = async (courseData) => {
    // Generate unique ID if not provided
    if (!courseData.id) {
        courseData.id = `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    // Generate slug from title if not provided
    if (!courseData.slug) {
        courseData.slug = courseData.title
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    }

    // Ensure slug uniqueness
    let slug = courseData.slug;
    let counter = 1;
    while (await Course.findOne({ slug })) {
        slug = `${courseData.slug}-${counter}`;
        counter++;
    }
    courseData.slug = slug;

    const course = new Course(courseData);
    await course.save();
    return course;
};

// Get all courses with pagination and filters
const getAllCourses = async (query) => {
    const {
        page = 1,
        limit = 12,
        search,
        category,
        level,
        instructorId,
        sort
    } = query;

    const filter = {};

    if (instructorId) {
        filter.instructorId = instructorId;
    }

    // Search
    if (search) {
        const trimmedSearch = search.trim();
        // Escape special regex characters
        const escapedSearch = trimmedSearch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };

        // Also search in instructors name
        const matchingInstructors = await Instructor.find({
            name: searchRegex
        }).select('id');
        const instructorIds = matchingInstructors.map(inst => inst.id);

        filter.$or = [
            { title: searchRegex },
            { description: searchRegex },
            { category: searchRegex },
            { subcategory: searchRegex },
            { instructorId: { $in: instructorIds } }
        ];
    }

    // Filters
    if (category && category !== 'all') {
        filter.category = category;
    }
    if (level && level !== 'all') {
        // If a specific level is requested, also include "All Levels" 
        // as they are suitable for everyone including beginners/intermediates/advanced
        filter.level = { $in: [level, 'All Levels'] };
    }

    // Sorthing
    let sortOption = {};
    switch (sort) {
        case 'popular':
            sortOption = { studentsEnrolled: -1 };
            break;
        case 'rating':
            sortOption = { rating: -1 };
            break;
        case 'newest':
            sortOption = { createdAt: -1 };
            break;
        case 'price-low':
            sortOption = { price: 1 };
            break;
        case 'price-high':
            sortOption = { price: -1 };
            break;
        default:
            sortOption = { studentsEnrolled: -1 }; // Default to popular
    }

    const courses = await Course.find(filter)
        .sort(sortOption)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

    const count = await Course.countDocuments(filter);

    return {
        courses,
        totalPages: Math.ceil(count / limit),
        currentPage: Number(page),
        totalItems: count
    };
};

// Get single course by slug or ID
const getCourse = async (identifier) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const course = await Course.findOne({
        $or: [
            { id: identifier },
            { slug: identifier },
            ...(isObjectId ? [{ _id: identifier }] : [])
        ]
    });

    if (!course) {
        throw new Error('Course not found');
    }
    return course;
};

// Update course
const updateCourse = async (id, updateData) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const course = await Course.findOneAndUpdate(
        {
            $or: [
                { id: id },
                ...(isObjectId ? [{ _id: id }] : [])
            ]
        },
        updateData,
        { new: true }
    );
    if (!course) {
        throw new Error('Course not found');
    }
    return course;
};

// Delete course
const deleteCourse = async (id) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const course = await Course.findOneAndDelete({
        $or: [
            { id: id },
            ...(isObjectId ? [{ _id: id }] : [])
        ]
    });
    if (!course) {
        throw new Error('Course not found');
    }
    return { message: 'Course deleted successfully' };
};

// Get all unique categories
const getCoursesCategories = async () => {
    const categories = await Course.distinct('category');
    return categories.sort();
};

module.exports = {
    createCourse,
    getAllCourses,
    getCourse,
    updateCourse,
    deleteCourse,
    getCoursesCategories
};