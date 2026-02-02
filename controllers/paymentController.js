const {Payment} = require('../model/PaymentModel')

const axios = require('axios');


const initializePayment = async (req, res) => {
  const { v4: uuidv4 } = await import('uuid');
  try {
    const transactionRef = uuidv4();
    res.status(200).json({ reference: transactionRef });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


const verifyPayment = async (req, res) => {
  try {
     const { id } = req.user;
     const { reference } = req.params;
     const { amount } = req.body;

    const verifyRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = verifyRes.data.data;
    
    let payment

    if (data.status === 'success') {
      
    payment = await Payment.create({
      user: id,
      amount,
      transactionRef: reference,
      status: 'paid',
      paymentMethod: data.channel,
      paymentChannel: data.authorization?.bank || null,
      mobileMoneyNumber: data.authorization?.mobile_money_number || null,
      fundedAt: new Date(),
      });
    }

    res.status(200).json({data,payment});
  } catch (err) {
    console.error(err);
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
