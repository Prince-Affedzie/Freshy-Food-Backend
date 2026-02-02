const User = require('../model/User');
const Product = require('../model/Product');

const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    const product = await Product.findById(productId);
    if (!product || !product.isAvailable) {
      return res.status(404).json({ message: 'Product not available' });
    }

    const user = await User.findById(userId);

    const cartItemIndex = user.cartItems.findIndex(
      item => item.product.toString() === productId
    );

    if (cartItemIndex > -1) {
      user.cartItems[cartItemIndex].quantity += quantity;
    } else {
      user.cartItems.push({ product: productId, quantity });
    }

    await user.save();

    res.status(200).json({
      message: 'Product added to cart',
      cartItems: user.cartItems
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add to cart', error });
  }
};


const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const user = await User.findById(userId);

    user.cartItems = user.cartItems.filter(
      item => item.product.toString() !== productId
    );

    await user.save();

    res.status(200).json({
      message: 'Product removed from cart',
      cartItems: user.cartItems
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove item', error });
  }
};


const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const user = await User.findById(userId);

    const cartItem = user.cartItems.find(
      item => item.product.toString() === productId
    );

    if (!cartItem) {
      return res.status(404).json({ message: 'Item not in cart' });
    }

    cartItem.quantity = quantity;
    await user.save();

    res.status(200).json({
      message: 'Cart updated',
      cartItems: user.cartItems
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update cart', error });
  }
};

const addToFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    console.log(req.params)

    const user = await User.findById(userId);

    const alreadyFavorite = user.favorites.some(
      item => item.product === productId
    );

    if (alreadyFavorite) {
      return res.status(400).json({ message: 'Already in favorites' });
    }

    user.favorites.push({ product: productId });
    await user.save();

    res.status(200).json({
      message: 'Added to favorites',
      favorites: user.favorites
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Failed to add favorite', error });
  }
};


const removeFromFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const user = await User.findById(userId);

    user.favorites = user.favorites.filter(
      item => item.product.toString() !== productId
    );

    await user.save();

    res.status(200).json({
      message: 'Removed from favorites',
      favorites: user.favorites
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove favorite', error });
  }
};


const getUserCartAndFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('cartItems.product')
      .populate('favorites.product');

    res.status(200).json({
      cartItems: user.cartItems,
      favorites: user.favorites
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch data', error });
  }
};

const clearCart = async (req, res) => {
  try {
    // Direct update is faster and more "atomic"
    await User.findByIdAndUpdate(
      req.user.id, 
      { $set: { cartItems: [] } },
      { new: true } // Optional: returns the updated document
    );

    res.status(200).json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    res.status(500).json({ message: 'Server error while clearing cart', error: error.message });
  }
};

module.exports = {addToCart,getUserCartAndFavorites,removeFromCart, clearCart,
    removeFromFavorites,addToFavorites,updateCartQuantity}




