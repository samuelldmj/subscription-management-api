import { Router } from "express";

const subscriptionRouter = Router()

subscriptionRouter.get('/', (req, res) => res.send({ title: 'GET all subscriptions' }));

subscriptionRouter.get('/:id', (req, res) => res.send({ title: 'GET subscription by id' }));

subscriptionRouter.post('/', (req, res) => res.send({ title: 'create subscription' }));

subscriptionRouter.put('/:id', (req, res) => res.send({ title: 'update subscription' }));

subscriptionRouter.delete('/:id', (req, res) => res.send({ title: 'delete a subscription' }));

subscriptionRouter.get('/user/:id', (req, res) => res.send({ title: 'GET all user subscriptions' }));

subscriptionRouter.put('/:id/cancel', (req, res) => res.send({ title: 'cancel subscriptions' }));

subscriptionRouter.get('/upcoming-renewals', (req, res) => res.send({ title: 'get upcomig renewals' }));

export default subscriptionRouter;