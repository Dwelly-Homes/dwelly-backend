import { Router } from 'express';
import { getCounties } from '../controllers/county.controller';

const router: Router = Router();

router.get('/', getCounties);

export default router;
