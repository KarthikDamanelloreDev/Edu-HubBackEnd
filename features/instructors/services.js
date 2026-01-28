const Instructor = require('./schema');
const { v4: uuidv4 } = require('uuid'); // If you want to generate ID, or just use timestamp/counter

// Create Instructor
const createInstructor = async (data) => {
    // Generate slug from name if not provided
    if (!data.slug) {
        data.slug = data.name
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    }

    // Ensure slug uniqueness
    let slug = data.slug;
    let counter = 1;
    while (await Instructor.findOne({ slug })) {
        slug = `${data.slug}-${counter}`;
        counter++;
    }
    data.slug = slug;

    // Generate custom ID if not provided (frontend data has 'i001', so we might want to let them provide it or generate one)
    if (!data.id) {
        // Simple ID generation for now, or use UUID
        data.id = `i${Date.now()}`;
    }

    const instructor = new Instructor(data);
    await instructor.save();
    return instructor;
};

// GetAllInstructors (No pagination)
const getAllInstructors = async () => {
    return await Instructor.find({}).sort({ createdAt: -1 });
};

// Get Instructor by ID or Slug
const getInstructor = async (identifier) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const instructor = await Instructor.findOne({
        $or: [
            { id: identifier },
            { slug: identifier },
            ...(isObjectId ? [{ _id: identifier }] : [])
        ]
    });

    if (!instructor) {
        throw new Error('Instructor not found');
    }
    return instructor;
};

// Update Instructor
const updateInstructor = async (id, updateData) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const instructor = await Instructor.findOneAndUpdate(
        {
            $or: [
                { id: id },
                ...(isObjectId ? [{ _id: id }] : [])
            ]
        },
        updateData,
        { new: true }
    );

    if (!instructor) {
        throw new Error('Instructor not found');
    }
    return instructor;
};

// Delete Instructor
const deleteInstructor = async (id) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const instructor = await Instructor.findOneAndDelete({
        $or: [
            { id: id },
            ...(isObjectId ? [{ _id: id }] : [])
        ]
    });

    if (!instructor) {
        throw new Error('Instructor not found');
    }
    return { message: 'Instructor deleted successfully' };
};

module.exports = {
    createInstructor,
    getAllInstructors,
    getInstructor,
    updateInstructor,
    deleteInstructor
};