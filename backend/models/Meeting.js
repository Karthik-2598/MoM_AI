const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
    userId:{type:mongoose.Schema.Types.ObjectId, ref:'User', required: true},
    title: String,
    date: String,
    rawNotes: String,
    analysis: Object, //stores JSON from AI
    templateType: String,
    createdAt: {type: Date, default: Date.now},

});
module.exports = mongoose.model('Meeting', MeetingSchema);