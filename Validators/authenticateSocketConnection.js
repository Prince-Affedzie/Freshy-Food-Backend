const cookie = require('cookie');
const jwt = require('jsonwebtoken');

const authenticateSocketConnection = (socket, next) => {
    
    let token = socket.handshake.auth?.token;
    let authMethod = 'Auth Object'; 
    console.log(token)

   
    if (!token) {
        const cookies = socket.handshake.headers.cookie;

        if (cookies) {
            try {
                
                const parsed = cookie.parse(cookies);
                token = parsed.token;
                authMethod = 'Cookie';
            } catch (err) {
               
                console.error("Cookie parsing failed:", err);
            }
        }
    }

   
    if (!token) {
        return next(new Error('Authentication Error: No token found in cookie or auth object.'));
    }

    
    jwt.verify(token, process.env.token, (err, user) => {
        if (err) {
           
            console.error(`JWT Verification Failed (${authMethod}):`, err.message);
            return next(new Error('Authentication Error: Invalid token.'));
        }
        
       
        socket.user = user;
        
        next();
    });
};

module.exports = { authenticateSocketConnection };