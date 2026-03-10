const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

 const sendWelcomeEmail=async(userEmail, firstName) =>{
 console.log("sending email")
 try{
   const response = await resend.emails.send({
    from: "FreshyFood Factory <noreply@mail.workaflow.live>",
    to: userEmail,
    subject: "Welcome to FreshyFood Factory 🛒",
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.6;">
        <h2>Hello ${firstName},</h2>

        <p>Welcome to <strong>FreshyFood Factory</strong>! 🎉</p>

        <p>We're excited to have you join our community. 
        Fresh groceries, healthy food items, and everyday kitchen essentials 
        are now just a few clicks away.</p>

        <p>With FreshyFood Factory you can:</p>

        <ul>
          <li>🥦 Shop fresh groceries easily</li>
          <li>🚚 Get convenient delivery to your doorstep</li>
          <li>🛒 Enjoy affordable and quality food items</li>
        </ul>

        <p>Start exploring our store and get your kitchen stocked with fresh goodness.</p>

        <p>
          <a href="https://play.google.com/store/apps/details?id=com.freshyfood.factory"
            style="background:#2f855a;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;">
            Start Shopping
          </a>
        </p>

        <p>Thank you for choosing us to be part of your daily kitchen needs.</p>

        <p>
          Warm regards,<br>
          <strong>The FreshyFood Factory Team</strong>
        </p>
      </div>
    `
  })
  console.log("Resend response:", response);



} catch(error){
    console.error("Welcome email error:", error);
  }
}



const sendOrderConfirmationEmail=async(userEmail, firstName, order) =>{
  try {
    const itemsList = order.orderItems
      .map(
        (item) =>
          `<li>${item.name} - ${item.quantity} x GHS ${item.price}</li>`
      )
      .join("");

    await resend.emails.send({
      from: "FreshyFood Factory <noreply@mail.workaflow.live>",
      to: userEmail,
      subject: `Your FreshyFood Factory Order #${order._id} is Confirmed 🛒`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.6;">
          
          <h2>Hi ${firstName},</h2>

          <p>Thank you for shopping with <strong>FreshyFood Factory</strong>! 🎉</p>

          <p>Your order has been successfully received and is now being processed.</p>

          <h3>Order Summary</h3>

          <ul>
            ${itemsList}
          </ul>

          <p><strong>Total:</strong> GHS ${order.totalPrice}</p>

          <p><strong>Delivery Address:</strong> ${order.shippingAddress.address}</p>

          <p>We’ll notify you once your order is on the way 🚚</p>

          <p>
            If you have any questions, feel free to contact our support team.
          </p>

          <p>
            Thank you for choosing FreshyFood Factory for your kitchen needs.
          </p>

          <br>

          <p>
            Best regards,<br>
            <strong>FreshyFood Factory Team</strong>
          </p>

        </div>
      `
    });

  } catch (error) {
    console.error("Order confirmation email error:", error);
  }
}


module.exports = {sendWelcomeEmail,sendOrderConfirmationEmail};