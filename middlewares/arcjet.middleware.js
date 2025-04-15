import aj from "../config/arcjet.js";


const arcjetMiddleware = async (req, res, next) => {
    try {
        //{ requested: 1 } for every request deduct one token
        const decision = await aj.protect(req, { requested: 1 });

        console.log('Arcjet Decision:', {
            isDenied: decision.isDenied(),
            reason: decision.reason,
            botDetails: decision.reason.isBot() ? decision.reason : null,
        });

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
                return res.status(429).json({
                    error: 'Rate limit exceeded'
                });
            }
            if (decision.reason.isBot()) {
                return res.status(403).json({
                    error: 'Bot detected'
                });
            }
            return res.status(403).json({ error: 'Access Denied' })
        }
        next();

    } catch (error) {
        console.log(`Arcjet Middleware Error: ${error}`)
        next(error);
    }
}

export default arcjetMiddleware;