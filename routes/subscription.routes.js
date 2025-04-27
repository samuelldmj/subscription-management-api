import { Router } from "express";
import { authorize } from "../middlewares/auth.middleware.js";
import { createSubscription, getUserSubscriptions, renewSubscription } from "../Controller/subscription.controller.js";


const subscriptionRouter = Router();

subscriptionRouter.get('/', (req, res) => res.send({ title: 'GET all subscriptions' }));

subscriptionRouter.get('/:id', (req, res) => res.send({ title: 'GET subscription by id' }));

subscriptionRouter.post('/', authorize, createSubscription);

subscriptionRouter.put('/:id', (req, res) => res.send({ title: 'update subscription' }));

subscriptionRouter.delete('/:id', (req, res) => res.send({ title: 'delete a subscription' }));

subscriptionRouter.get('/user/:id', authorize, getUserSubscriptions);

subscriptionRouter.post("/renew", authorize, renewSubscription);

subscriptionRouter.put('/:id/cancel', (req, res) => res.send({ title: 'cancel subscriptions' }));

subscriptionRouter.get('/upcoming-renewals', (req, res) => res.send({ title: 'get upcomig renewals' }));


export default subscriptionRouter;