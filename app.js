const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const mongoose = require('mongoose')
const Package = require('./model/Package');
const {Server} = require('socket.io')
const http = require('http')
const cors = require('cors')
require('dotenv').config()
const NotificationService = require('./services/notificationService');
const {authenticateSocketConnection} = require('./Validators/authenticateSocketConnection')


const packagerouter = require('./routes/packageRoute')
const productrouter = require('./routes/productRoute')
const orderrouter = require('./routes/orderRoute')
const userRoute = require('./routes/userRoute')
const userActionRouter = require('./routes/cartAndFavoriteRoute')
const paymentRoute = require('./routes/paymentRoute')
const adminRoutes = require('./routes/adminRoutes')


const app  = express()

app.use(express.json({}))
app.use(cookieParser())
app.use(bodyParser.urlencoded({extended:true}))
app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    credentials: true
}))

const server = http.createServer(app)

const io = new Server(server,{
    cors:{
        origin:true,
        credentials:true,
        methods: ['GET', 'POST']
    }
})

io.use(authenticateSocketConnection)


io.on('connection',(socket)=>{
    const userId = socket.user.id
    console.log('Someone joined the connection')
    socket.join(userId)
    //socketHandler(io,socket)

    socket.on('disconnect',()=>{
        console.log("User Disconnected")
    })

})
const notificationService = new NotificationService(io);

app.use('/api',packagerouter)
app.use('/api',productrouter)
app.use('/api',orderrouter)
app.use('/api',userRoute)
app.use('/api',userActionRouter)
app.use('/api',paymentRoute)
app.use('/api',adminRoutes)
app.set('notificationService', notificationService);


mongo_connection_url = process.env.DB_URL

mongoose.connect(mongo_connection_url)
         .then(()=>{
        server.listen(process.env.PORT || 5000)
        console.log('Listening on port 5000')
         }).catch((err)=>console.log(err))

