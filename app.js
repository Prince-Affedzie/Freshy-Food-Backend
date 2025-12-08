const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const mongoose = require('mongoose')
const Package = require('./model/Package');
const cors = require('cors')
require('dotenv').config()


const packagerouter = require('./routes/packageRoute')
const productrouter = require('./routes/productRoute')
const orderrouter = require('./routes/orderRoute')


const app  = express()

app.use(express.json({}))
app.use(cookieParser())
app.use(bodyParser.urlencoded({extended:true}))

app.use(cors({
    origin:true,
    credentials: true
}))



app.use('/api',packagerouter)
app.use('/api',productrouter)
app.use('/api',orderrouter)


mongo_connection_url = process.env.DB_URL

mongoose.connect(mongo_connection_url)
         .then(()=>{
        app.listen(process.env.PORT || 5000)
        console.log('Listening on port 5000')
         }).catch((err)=>console.log(err))

