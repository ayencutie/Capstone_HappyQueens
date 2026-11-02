// Where PayMongo sends the customer back to. We ask PayMongo (through our server) if the payment really went through.
hqOnReady(async function () {
  var box = document.getElementById('completeCard');
  var p = new URLSearchParams(location.search), code = p.get('order') || '', cancelled = p.get('cancelled') === '1', isBal = p.get('balance') === '1';
  function peso(n) { return '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function load() {
    box.innerHTML = '<p class="order-message">Checking your payment&hellip;</p>';
    var r = await hqShop('verify_payment', { orderId: code });
    if (!r.ok) { box.innerHTML = '<div class="complete-card"><h1>Order not found</h1><p>' + hqEsc(r.error || '') + '</p><a class="btn btn-filled" href="homepage.html">Back to Home</a></div>'; return; }
    var o = r.order, paid = o.paymentStatus !== 'unpaid';
    if (isBal) {   // the customer paid (or tried to pay) the balance
      var brows = '<div class="summary"><div class="summary-row"><span>Order</span><span>' + hqEsc(o.orderId) + '</span></div><div class="summary-row"><span>Total</span><span>' + peso(o.total) + '</span></div>' +
        '<div class="summary-row is-due"><span>' + (o.balance > 0.009 ? 'Balance to pay' : 'Paid in full') + '</span><span>' + peso(o.balance > 0.009 ? o.balance : o.paid) + '</span></div></div>';
      if (o.balance <= 0.009 && o.paymentStatus === 'paid') {
        box.innerHTML = '<div class="complete-card"><div class="complete-icon"><i class="fa-solid fa-check"></i></div><h1>Balance received!</h1><p>Thank you! Your order is fully paid. We will send it out for delivery or have it ready for pickup.</p>' + brows +
          '<div class="complete-actions"><a class="btn btn-filled" href="orders.html">View my orders</a><a class="btn btn-outline" href="homepage.html">Back to Home</a></div></div>';
      } else {
        box.innerHTML = '<div class="complete-card"><div class="complete-icon is-warn"><i class="fa-solid fa-exclamation"></i></div><h1>' + (cancelled ? 'Payment cancelled' : 'Payment not confirmed yet') + '</h1><p>' + (cancelled ? 'No money was taken. You can pay the balance whenever you are ready.' : 'If you already paid, wait a few seconds and check again.') + '</p>' + brows +
          '<div class="complete-actions"><button type="button" class="btn btn-filled" id="payNow">Pay balance</button><button type="button" class="btn btn-outline" id="checkAgain">Check again</button></div></div>';
        document.getElementById('checkAgain').addEventListener('click', load);
        document.getElementById('payNow').addEventListener('click', async function () {
          this.disabled = true; var pay = await hqShop('pay_balance', { orderId: code });
          if (!pay.ok) { alert(pay.error || 'Could not start the payment.'); this.disabled = false; return; }
          window.location.href = pay.checkoutUrl;
        });
      }
      return;
    }
    var rows = '<div class="summary">' +
      '<div class="summary-row"><span>Order</span><span>' + hqEsc(o.orderId) + '</span></div>' +
      '<div class="summary-row"><span>' + hqEsc(o.service) + ' &times; ' + o.qty + '</span><span>' + peso(o.total) + '</span></div>' +
      (paid ? '<div class="summary-row is-due"><span>Paid via ' + hqEsc(o.method) + '</span><span>' + peso(o.paid) + '</span></div>' : '<div class="summary-row is-due"><span>Amount to pay now</span><span>' + peso(o.due) + '</span></div>') +
      (paid && o.balance > 0 ? '<div class="summary-row"><span>Balance (pay on pickup / delivery)</span><span>' + peso(o.balance) + '</span></div>' : '') + '</div>';

    if (paid) {
      box.innerHTML = '<div class="complete-card"><div class="complete-icon"><i class="fa-solid fa-check"></i></div><h1>' + (o.balance > 0 ? 'Down payment received!' : 'Payment received!') + '</h1>' +
        '<p>Thank you! Our team will start on your order. We will contact you if we need anything.</p>' + rows +
        '<div class="complete-actions"><a class="btn btn-filled" href="our-services.html">Order something else</a><a class="btn btn-outline" href="homepage.html">Back to Home</a></div></div>';
    } else {
      box.innerHTML = '<div class="complete-card"><div class="complete-icon is-warn"><i class="fa-solid fa-exclamation"></i></div><h1>' + (cancelled ? 'Payment cancelled' : 'Payment not confirmed yet') + '</h1>' +
        '<p>' + (cancelled ? 'No money was taken. Your order is saved, and you can pay whenever you are ready.' : 'If you already paid, wait a few seconds and check again.') + '</p>' + rows +
        '<div class="complete-actions"><button type="button" class="btn btn-filled" id="payNow">Pay now</button><button type="button" class="btn btn-outline" id="checkAgain">Check again</button></div></div>';
      document.getElementById('checkAgain').addEventListener('click', load);
      document.getElementById('payNow').addEventListener('click', async function () {
        this.disabled = true;
        var pay = await hqShop('pay_order', { orderId: code });
        if (!pay.ok) { alert(pay.error || 'Could not start the payment.'); this.disabled = false; return; }
        window.location.href = pay.checkoutUrl;
      });
    }
  }
  load();
});
