const User = require('../model/User')
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const { OAuth2Client } = require('google-auth-library');
const {NotificationModel}= require('../model/NotificationModel')

const googleclient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signUpByGoogle = async (req, res) => {
  const { token} = req.body;
  const notificationService = req.app.get("notificationService");
 
        
  try {
   
    const ticket = await googleclient.verifyIdToken({
        idToken: token,
        audience: [
          process.env.GOOGLE_WEB_CLIENT_ID,
          process.env.GOOGLE_ANDROID_CLIENT_ID,
          process.env.GOOGLE_IOS_CLIENT_ID
        ],
    });
    
    const payload = ticket.getPayload();
    const { email, name,phone, picture, sub: googleId } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        firstName: name,
        phone, 
        
      });
    }else{
       return res.status(400).json({mesaage: "Email had Already been taken"})
    }

    if(phone) {
      user.phone = phone
    }

     try {
      await notificationService.notifyAdminsNewUser(user);
    } catch (e) {
      console.error('Admin signup notification failed:', e);
    }


    const apptoken = jwt.sign({id:user._id,role:user.role},process.env.token,{expiresIn:"30d"})
    res.cookie("token",apptoken,{httpOnly:true,sameSite:"None",secure:true})
    //processEvent("NEW_USER",user);
    //await notificationService.sendWelcomeNotification(user._id)
    console.log(user)
    res.status(200).json({message:"Registration Successful",role:user.role,user:user,token:apptoken})
  } catch (error) {
    console.log(error)
    res.status(401).json({ message: "Invalid Google Token" });
  }
};


const google_login = async(req,res)=>{
   const {token} = req.body
   console.log("Logging In")

    try{
        
        const ticket = await googleclient.verifyIdToken({
        idToken: token,
        audience: [
          process.env.GOOGLE_WEB_CLIENT_ID,
          process.env.GOOGLE_ANDROID_CLIENT_ID,
          process.env.GOOGLE_IOS_CLIENT_ID
        ],
      });

    const payload = ticket.getPayload();
    const { email } = payload;

    const lowerCaseEmail = email.toLowerCase()
    const findUser = await User.findOne({email:lowerCaseEmail});
    if(!findUser){
      return res.status(404).json({message: "Account Not Found. Please sign up first"})
    }
       
        const apptoken = jwt.sign({id:findUser._id,role:findUser.role},process.env.token,{expiresIn:"30d"})
        res.cookie("token",apptoken,{httpOnly:true,sameSite:"None",secure:true})
        console.log(findUser)
        
        res.status(200).json({message:"Login Successful",role:findUser.role,user:findUser,token:apptoken})

    }catch(err){
        console.log(err)
        return res.status(500).json({message: "Internal Server Error"})
    }

}

const signUp = async(req,res)=>{
    //console.log(req.body)
    const notificationService = req.app.get("notificationService");
    const {firstName,lastName,phone,password} = req.body
    
    console.log("Signing Up")

    try{
    if(!firstName || !lastName || !phone || !password){
        return res.status(400).json({message: "All fields are required"})
    }
    
    const userExist = await User.findOne({phone: phone })
    if(userExist){
        return res.status(400).json({mesaage: "phone number had Already been taken"})
    }
    const hashedPassword = await bcrypt.hash(password,10)

    const user = new User({
        firstName,
        lastName,
        phone,
        password:hashedPassword
    })

    await user.save()
     try {
      await notificationService.notifyAdminsNewUser(user);
    } catch (e) {
      console.error('Admin signup notification failed:', e);
    }

    const token = jwt.sign({id:user._id,role:user.role},process.env.token,{expiresIn:"30d"})
    res.cookie("token",token,{httpOnly:true,sameSite:"None",secure:true})
    res.status(200).json({message:"Registration Successful",role:user.role,user:user,token:token})
}catch(err){
    console.log(err)
    res.status(500).json({message:"Internal Server Error"})
}
}


const login = async(req,res)=>{
    const {phone,password} = req.body
   console.log("Logging In")

    try{
        if (!phone || !password){
            return res.status(400).json({message:"All fields are required"})
        }
       
        const findUser = await User.findOne({phone:phone})
        if(!findUser){
            return res.status(404).json({message: "Account doesn't Exist"})
        }
        const isPasswordMatch = await bcrypt.compare(password,findUser.password)
        if(!isPasswordMatch){
            return res.status(401).json({message:"Invalid Credentials"})
        }
        const token = jwt.sign({id:findUser._id,role:findUser.role},process.env.token,{expiresIn:"30d"})
        res.cookie("token",token,{httpOnly:true,sameSite:"None",secure:true})
        res.status(200).json({message:"Login Successful",role:findUser.role,user:findUser,token:token})

    }catch(err){
        console.log(err)
        return res.status(500).json({message: "Internal Server Error"})
    }

}


const logout =async(req,res)=>{
    let token
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 2. If no cookie, check Authorization header (for mobile app)
    else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    //console.log(req.headers.authorization.split(" ")[1])
    try{
    if(!token){
        return res.status(400).json({message:"No token Provided"})
    }
    await res.clearCookie(token,{httpOnly:true,secure:true,sameSite:'Strict'})
    res.status(200).json({message:"Logout Succesful"})
}catch(error){
    console.log(error)
}
}


const updateUser = async(req,res)=>{
    try{
        const {id} = req.user
        const update = req.body
        const user = await User.findById(id)
        if(!user){
            return res.status(404).json({message:'User Account Not Found'})
        }
        console.log(user)
        Object.assign(user,update)
        await user.save()
        res.status(200).json({message:"User Info Updated Successfully"})

    }catch(error){
        console.log(error)
        res.status(500).json({message:"Internal Server Error"})
    }
}


const deleteAccount = async(req,res)=>{
    try{

        const {id} = req.user
        const user = await User.findById(id)
        if(!user){
            return res.status(404).json({message:'User Account Not Found'})
        }
        user.deleteOne()
        const {token} = req.cookies
        await res.clearCookie(token,{httpOnly:true,secure:true,sameSite:'Strict'})
        res.status(200).json({message:"User account deleted Successfully"})

    }catch(error){
         console.log(error)
        res.status(500).json({message:"Internal Server Error"})
    }
}

const getNotifications = async(req,res)=>{
    try{

        const {id} = req.user
       
        const notifications = await NotificationModel.find({user:id}).sort({createdAt:-1})
        
        res.status(200).json(notifications)

    }catch(err){
        console.log(err)
        res.status(500).json({message:"Internal Server Error"})
    }
  }

  const createNotification = async(req,res)=>{
    try{
        const {userId,message,type} = req.body
        const notification = new NotificationModel({
            user:userId,
            type:type,
            message:message,
            

    })
     io.to(userId).emit('notification',notification)
        await notification.save()
        res.status(200).json(notification)

    }catch(err){
        console.log(err)
        res.status(500).json({message:"Internal Server Error"})
    }
  }

  const markNotificationAsRead =async(req,res)=>{
    try{
        const {ids} = req.body
        console.log(req.body)
        await NotificationModel.updateMany({_id:{$in:ids}},{$set:{read:true}})
        res.status(200).json({ success: true });

    }catch(err){
        console.log(err)
        res.status(500).json({message:"Internal Server Error"})

    }
  }

  const deleteNotification = async(req,res)=>{
    try{
      const {Id} = req.params
      console.log(Id)
      const notification = await NotificationModel.findById(Id)
      if(!notification){
        return res.status(404).json({message:"Notification not Found"})
      }
      await notification.deleteOne()
      res.status(200).json({message:"Notification Deleted Successfully"})

    }catch(err){
      console.log(err)
      res.status(500).json({message:"Internal Server Error"})
    }
  }

  const deleteBulkNotification = async(req,res)=>{
    try{
        const ids = req.body
        console.log(req.body)
        await NotificationModel.deleteMany({_id:{$in:ids}})
        res.status(200).json({message:"Notifications Deleted Successfully"})
    }catch(err){
      console.log(err)
      res.status(500).json({message:"Internal Server Error"})
    }
  }


  const updatePushToken = async(req,res)=>{
    try{
      const {id} = req.user
      const {token} = req.body
      const user  = await User.findById(id)
      user.pushToken = token
      await user.save()
      res.status(200).json({message:'Push Token Updated Successfully'})

    }catch(err){
      console.log(err)
      res.status(500).json({message:"Internal Server Error"})
    }
  }

  





module.exports = {signUp,login,logout,updateUser,deleteAccount,markNotificationAsRead,signUpByGoogle,google_login,
    getNotifications,deleteBulkNotification,updatePushToken,deleteNotification,createNotification}




