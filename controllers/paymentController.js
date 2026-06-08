const {Payment} = require('../model/PaymentModel')

const axios = require('axios');


const initializePayment = async (req, res) => {
  try {
    const { email, amount, phone } = req.body;
    const { v4: uuidv4 } = await import('uuid');
    console.log(req.body)

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const transactionRef = uuidv4();

    // 🔥 IMPORTANT: Paystack expects amount in kobo/pesewas
    const amountInPesewas = Math.round(Number(amount) * 100);

    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInPesewas,
        reference: transactionRef,
        currency: "GHS",
        metadata: {
          phone,
        },

        // ✅ Optional but recommended
       // callback_url: "https://yourdomain.com/payment-success",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = paystackRes.data.data;

    res.status(200).json({
      authorization_url: data.authorization_url,
      reference: data.reference,
      access_code: data.access_code,
    });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ message: "Failed to initialize payment" });
  }
};


const verifyPayment = async (req, res) => {
  try {
     const { id } = req.user;
     const {reference}  = req.params;
     
     if (!reference) {
      return res.status(400).json({ message: "Missing reference" });s
    }

    const existing = await Payment.findOne({ transactionRef: reference });

   if (existing) {
    return res.status(200).json({ message: "Payment already verified" });
    }

    const verifyRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = verifyRes.data.data;
    const verifiedAmount = data.amount / 100;
    console.log("Data", data)
    
    let payment

    if (data.status === 'success') {
      
    payment = await Payment.create({
      user: id,
      amount:verifiedAmount,
      transactionRef: reference,
      status: 'paid',
      paymentMethod: data.channel,
      paymentChannel: data.authorization?.bank || null,
      mobileMoneyNumber: data.authorization?.mobile_money_number || null,
      fundedAt: new Date(),
      });
    }
    console.log(payment)

    res.status(200).json({message:"Payment successfully made",success:true});
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};




const refundPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const payment = await Payment.findOne({ transactionRef: reference });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'paid') {
      return res
        .status(400)
        .json({ message: 'Only Paid payments can be refunded' });
    }

    // Issue refund using Paystack Refund API
    const refundRes = await axios.post(
      'https://api.paystack.co/refund',
      { transaction: reference },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    await Payment.findByIdAndUpdate(payment._id, {
      status: 'refunded',
      refundedAt: new Date(),
    });

    res.status(200).json({
      message: 'Payment refunded successfully',
      refund: refundRes.data.data,
    });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ message: 'Failed to refund payment' });
  }
};


module.exports ={initializePayment,verifyPayment,refundPayment}
