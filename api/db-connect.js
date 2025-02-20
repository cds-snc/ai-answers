import mongoose from 'mongoose';
import '../models/interaction.js';
import '../models/question.js';
import '../models/answer.js';
import '../models/citation.js';
import '../models/expertFeedback.js';
import '../models/context.js';
import '../models/chat.js';
import '../models/batch.js';


let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
// Does this need to called each time??
async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      //useNewUrlParser: true,
      //useUnifiedTopology: true,
      bufferCommands: false,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 120000,        
      connectTimeoutMS: 60000,        
    
    };

    cached.promise = mongoose.connect(process.env.DOCDB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;