const validateInstructor = (data) => {
    const errors = [];

    if (!data.name) errors.push('Name is required');
    if (!data.title) errors.push('Title (Headline) is required');
    if (!data.bio) errors.push('Bio is required');
    if (!data.avatar) errors.push('Avatar URL is required');
    if (!data.expertise || !Array.isArray(data.expertise) || data.expertise.length === 0) {
        errors.push('At least one area of expertise is required');
    }

    return errors;
};

module.exports = {
    validateInstructor
};