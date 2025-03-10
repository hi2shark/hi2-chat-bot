import { ObjectId } from 'mongodb';

export default function autoId(id) {
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string') {
    try {
      return new ObjectId(id);
    } catch (e) {
      throw new Error('Invalid ID format');
    }
  }
  throw new Error('Invalid ID format');
}
