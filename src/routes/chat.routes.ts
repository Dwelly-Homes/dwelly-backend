import { Router } from 'express';
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
} from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';

const router: Router = Router();

router.use(authenticate);

router.get('/',                        getConversations);
router.post('/',                       getOrCreateConversation);
router.get('/:id/messages',            getMessages);
router.post('/:id/messages',           sendMessage);

export default router;
