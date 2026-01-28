const validateCourse = (data) => {
    const errors = [];

    if (!data.title) errors.push('Title is required');
    if (!data.category) errors.push('Category is required');
    if (!data.description) errors.push('Description is required');
    if (!data.instructorId) errors.push('Instructor ID is required');
    if (data.price === undefined || data.price === null) errors.push('Price is required');
    if (!data.thumbnail) errors.push('Thumbnail URL is required');
    if (!data.duration) errors.push('Duration is required');

    return errors;
};

module.exports = {
    validateCourse
};