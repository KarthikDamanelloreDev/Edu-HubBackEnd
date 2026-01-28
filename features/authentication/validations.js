const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validateRegisterStudent = (data) => {
    const errors = [];
    if (!data.firstName) errors.push('First Name is required');
    if (!data.lastName) errors.push('Last Name is required');
    if (!data.email) errors.push('Email is required');
    else if (!validateEmail(data.email)) errors.push('Invalid email format');
    if (!data.password) errors.push('Password is required');
    if (data.password && data.password.length < 6) errors.push('Password must be at least 6 characters');
    return errors;
};

const validateRegisterAdmin = (data) => {
    const errors = [];
    if (!data.email) errors.push('Email is required');
    else if (!validateEmail(data.email)) errors.push('Invalid email format');
    if (!data.password) errors.push('Password is required');
    if (data.password && data.password.length < 6) errors.push('Password must be at least 6 characters');
    return errors;
};

const validateLogin = (data) => {
    const errors = [];
    if (!data.email) errors.push('Email is required');
    if (!data.password) errors.push('Password is required');
    return errors;
};

module.exports = {
    validateRegisterStudent,
    validateRegisterAdmin,
    validateLogin
};