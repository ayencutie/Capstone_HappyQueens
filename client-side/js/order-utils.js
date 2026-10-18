// Shared by View Order and Track Order.
(function () {
  var LABEL = { 'pending': 'Pending', 'in-design': 'In Design', 'printing': 'Printing', 'packing': 'Packing', 'out-for-delivery': 'Out for Delivery', 'completed': 'Completed', 'cancelled': 'Cancelled' };
  var STEPS = ['pending', 'in-design', 'printing', 'packing', 'out-for-delivery', 'completed'];
  function peso(n) { return '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dateText(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  function payText(o) {
    if (o.paymentStatus === 'paid') return 'Paid in full via ' + o.method;
    if (o.paymentStatus === 'partial') return 'Down payment paid via ' + o.method;
    return 'Not paid yet';
  }
  function refundText(o) {
    if (o.status !== 'cancelled' || o.refundStatus === 'none') return '';
    if (o.refundStatus === 'refunded') return 'Refunded ' + peso(o.refundAmount) + ' to your e-wallet.';
    if (o.refundStatus === 'processing') return 'Your refund of ' + peso(o.refundAmount) + ' is being processed. Please allow some days for it to show in your e-wallet.';
    return 'Your refund of ' + peso(o.refundAmount) + ' is being handled by our team. We will contact you.';
  }

  // asks first, then cancels. Returns the updated order, or null.
  async function cancel(o) {
    var msg = o.paid > 0
      ? 'Cancel order ' + o.orderId + '?\n\nYour payment of ' + peso(o.paid) + ' will be refunded.\n(An order can only be cancelled while it is still Pending.)'
      : 'Cancel order ' + o.orderId + '?\n\n(An order can only be cancelled while it is still Pending.)';
    if (!confirm(msg)) return null;
    var r = await hqShop('cancel_order', { orderId: o.orderId });
    if (!r.ok) { alert(r.error || 'Could not cancel the order.'); return null; }
    var t = refundText(r.order);
    alert('Your order was cancelled.' + (t ? '\n\n' + t : ''));
    return r.order;
  }

  async function payNow(o) {
    var r = await hqShop('pay_order', { orderId: o.orderId });
    if (!r.ok) { alert(r.error || 'Could not start the payment.'); return; }
    window.location.href = r.checkoutUrl;
  }

  window.HQOrders = { LABEL: LABEL, STEPS: STEPS, peso: peso, dateText: dateText, payText: payText, refundText: refundText, cancel: cancel, payNow: payNow };
})();
