const validateAddToCart = (data) => {
    const errors = [];
    if (!data.courseId) errors.push('Course ID is required');
    return errors;
};

module.exports = {
    validateAddToCart
};