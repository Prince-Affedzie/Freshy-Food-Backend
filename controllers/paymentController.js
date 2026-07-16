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




/*const initializePayment = async (req, res) => {
  try {
    const { email, amount, phone } = req.body;
    const { v4: uuidv4 } = await import('uuid');
    console.log(req.body);

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const transactionRef = uuidv4();

    // 💡 Moolre expects the raw amount as a string (e.g. "10.00"), NOT in pesewas.
    const formattedAmount = Number(amount).toFixed(2).toString();

    const moolreRes = await axios.post(
      "https://api.moolre.com/embed/link", // Use "https://sandbox.moolre.com/embed/link" for testing
      {
        type: 1, // Required: Must be 1
        amount: formattedAmount,
        email: email,
        externalref: transactionRef,
        reusable: "0", // "0" for one-time payment, "1" for reusable
        currency: "GHS",
        accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || "", // Your Moolre Account Number
        metadata: {
          phone,
        },
      },
      {
        headers: {
          "X-API-USER": "cedimart",
          "X-API-PUBKEY": process.env.MOOLRE_PUBLIC_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    // Moolre response is structured as: { status: 1, data: { authorization_url: '...', reference: '...' } }
    const { data } = moolreRes.data;

    res.status(200).json({
      authorization_url: data.authorization_url,
      reference: data.reference,
    });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ message: "Failed to initialize payment with Moolre" });
  }
};*/


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



/*const verifyPayment = async (req, res) => {
  try {
    const { id } = req.user;
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Missing reference" });
    }

    // Check if we've already processed this payment in our database
    const existing = await Payment.findOne({ transactionRef: reference });
    if (existing) {
      return res.status(200).json({ message: "Payment already verified" });
    }

    // Call Moolre's status endpoint
    const verifyRes = await axios.post(
      "https://api.moolre.com/open/transact/status",
      {
        type: 1,                          // 1 matches the type we initiated with
        idtype: "1",            // Instructing Moolre we are querying by our UUID/externalref
        id: reference,                    // Your saved transaction reference
        accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || ""
      },
      {
        headers: {
          "X-API-USER": 'cedimart',
          "X-API-PUBKEY": process.env.MOOLRE_PUBLIC_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const apiResponse = verifyRes.data;
    console.log("Moolre Status Response:", apiResponse);

    // Moolre typically returns status: 1 for API success, and data holding the transaction details.
    // Check if transaction status equals 'success' or 'paid' (or status code 1 depending on API version)
    const transactionData = apiResponse.data;
    const isSuccessful = apiResponse.status === 1 || transactionData?.status === 'success' || transactionData?.status === 'paid';

    if (isSuccessful && transactionData) {
      // Moolre amounts are standard decimals, no division by 100 needed
      const verifiedAmount = Number(transactionData.amount);

      const payment = await Payment.create({
        user: id,
        amount: verifiedAmount,
        transactionRef: reference,
        status: 'paid',
        paymentMethod: transactionData.channel || 'momo', // Defaulting to momo if undefined
        paymentChannel: transactionData.provider || null, // MTN, Telecel, Card, etc.
        mobileMoneyNumber: transactionData.sender_number || null, // Sender wallet number
        fundedAt: new Date(),
      });

      console.log("Created Payment Record:", payment);
      return res.status(200).json({ message: "Payment successfully made", success: true });
    }

    return res.status(400).json({ message: "Payment not completed or failed", success: false });

  } catch (err) {
    console.error("Verification Error:", err.response?.data || err.message || err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};*/




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
