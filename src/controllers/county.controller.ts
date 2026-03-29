import { Request, Response } from 'express';
import { County } from '../models/County';

export const getCounties = async (req: Request, res: Response): Promise<void> => {
  try {
    const counties = await County.find().sort({ name: 1 }).select('name');
    res.status(200).json({
      success: true,
      data: counties,
    });
  } catch (error) {
    console.error('Error fetching counties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch counties',
    });
  }
};
