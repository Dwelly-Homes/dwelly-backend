import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { Property } from '../models/Property';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';

// GET /properties/saved
export const getSavedProperties = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
      .select('savedProperties')
      .populate({
        path: 'savedProperties.property',
        select: '_id title neighborhood county monthlyRent propertyType status images bedrooms bathrooms',
        match: { isHiddenByAdmin: { $ne: true } },
      });

    if (!user) { sendError(res, 'User not found.', 404); return; }

    // Filter out null entries (deleted/hidden properties)
    const savedProperties = (user.savedProperties || []).filter((entry) => entry.property != null);

    sendSuccess(res, 'Saved properties fetched.', { savedProperties });
  } catch (err) { next(err); }
};

// POST /properties/:id/save
export const saveProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const propertyId = String(req.params.id);

    if (!Types.ObjectId.isValid(propertyId)) {
      sendError(res, 'Invalid property ID.', 400); return;
    }

    const property = await Property.findOne({ _id: propertyId, status: 'available', isHiddenByAdmin: { $ne: true } });
    if (!property) { sendError(res, 'Property not found or unavailable.', 404); return; }

    const user = await User.findById(req.user!.userId).select('savedProperties');
    if (!user) { sendError(res, 'User not found.', 404); return; }

    const alreadySaved = user.savedProperties.some(
      (entry) => entry.property.toString() === propertyId
    );

    if (alreadySaved) {
      sendSuccess(res, 'Property already saved.', { saved: true });
      return;
    }

    user.savedProperties.push({ property: new Types.ObjectId(propertyId), savedAt: new Date() });
    await user.save();

    sendSuccess(res, 'Property saved.', { saved: true }, 201);
  } catch (err) { next(err); }
};

// DELETE /properties/:id/save
export const unsaveProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const propertyId = String(req.params.id);

    if (!Types.ObjectId.isValid(propertyId)) {
      sendError(res, 'Invalid property ID.', 400); return;
    }

    await User.findByIdAndUpdate(req.user!.userId, {
      $pull: { savedProperties: { property: new Types.ObjectId(propertyId) } },
    });

    sendSuccess(res, 'Property removed from saved.');
  } catch (err) { next(err); }
};
