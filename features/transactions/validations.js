const validateCheckout = (data) => {
    const errors = [];
    if (!data.paymentMethod) errors.push('Payment Method is required');
    if (!data.firstName) errors.push('First Name is required');
    if (!data.email) errors.push('Email is required');
    if (!data.phone) errors.push('Phone is required');
    if (!data.amount) errors.push('Amount is required');
    return errors;
};

module.exports = {
    validateCheckout
};