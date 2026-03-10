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
<p>Hello ${firstName},</p>

<p>Welcome to FreshyFood Factory 🎉</p>

<p>We're excited to have you. You can now order fresh groceries and kitchen essentials easily.</p>

<p>If you haven't explored the store yet, you can start here:</p>

<p>
<a href="https://play.google.com/store/apps/details?id=com.freshyfood.factory">
Download the FreshyFood app
</a>
</p>

<p>Thanks for joining us.</p>

<p>
Prince <br>
FreshyFood Factory
</p>
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