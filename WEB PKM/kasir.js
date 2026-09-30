/* Web PKM - Kasir Online (alur barcode aman, tanpa inline script) */
(() => {
  const boot = async () => {
    try {
      await KasirAuth.ready;
    } catch (error) {
      console.error('Kasir gagal memuat sesi:', error);
      return;
    }

    const STORE = {
      products: KasirAuth.key('products'),
      sales: KasirAuth.key('sales'),
      cash: KasirAuth.key('cash')
    };

    const $ = id => document.getElementById(id);
    const load = (key, fallback = []) => {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
      } catch {
        return fallback;
      }
    };
    const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
    const toast = message => {
      const el = $('toast');
      if (!el) return;
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove('show'), 2200);
    };
    const normalizeCode = value => String(value ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, '')
      .trim();

    let products = load(STORE.products, []);
    let cart = [];

    function findProduct(code) {
      const normalized = normalizeCode(code);
      if (!normalized) return null;
      return products.find(product => normalizeCode(product.barcode) === normalized) || null;
    }

    function add(code) {
      const normalized = normalizeCode(code);
      if (!normalized) {
        toast('Masukkan atau scan kode barcode terlebih dahulu.');
        return false;
      }

      const product = findProduct(normalized);
      if (!product) {
        toast('Barcode tidak ditemukan. Pastikan produk sudah dibuat di Produk.');
        return false;
      }

      const stock = Number(product.stock || 0);
      if (stock <= 0) {
        toast(`Stok ${product.name || 'produk'} habis. Atur stok di Storage.`);
        return false;
      }

      const existing = cart.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= stock) {
          toast('Jumlah melebihi stok tersedia.');
          return false;
        }
        existing.qty += 1;
      } else {
        cart.push({ ...product, qty: 1 });
      }

      render();
      toast(`${product.name || 'Produk'} ditambahkan ke keranjang.`);
      return true;
    }

    function total() {
      return cart.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
    }

    function change() {
      const cash = Number($('cash')?.value || 0);
      const difference = cash - total();
      $('changeVal').textContent = rp(Math.max(0, difference));
      $('change').style.background = cash && difference < 0 ? 'var(--redsoft)' : 'var(--soft)';
    }

    function render() {
      const body = $('cart');
      if (!body) return;
      body.innerHTML = '';
      $('empty').style.display = cart.length ? 'none' : 'block';

      cart.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><b>${esc(item.name)}</b><div class="small">${esc(item.barcode)}</div></td>
          <td>
            <div style="display:flex;gap:5px;align-items:center">
              <button type="button" class="btn secondary qd">−</button>
              <b>${item.qty}</b>
              <button type="button" class="btn secondary qi">+</button>
            </div>
          </td>
          <td class="money">${rp(item.price)}</td>
          <td class="money in">${rp(Number(item.price || 0) * item.qty)}</td>
          <td><button type="button" class="btn danger rm">✕</button></td>`;

        row.querySelector('.qi').onclick = () => {
          if (item.qty < Number(item.stock || 0)) item.qty += 1;
          else toast('Stok tidak cukup.');
          render();
        };
        row.querySelector('.qd').onclick = () => {
          item.qty -= 1;
          if (item.qty <= 0) cart.splice(index, 1);
          render();
        };
        row.querySelector('.rm').onclick = () => {
          cart.splice(index, 1);
          render();
        };
        body.appendChild(row);
      });

      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      $('items').textContent = `${count} item`;
      $('total').textContent = rp(total());
      $('checkout').disabled = cart.length === 0;
      change();
    }

    function quick() {
      const box = $('quick');
      if (!box) return;
      box.innerHTML = products.map(product => `
        <button type="button" class="product" style="text-align:left;cursor:pointer" data-code="${esc(product.barcode)}">
          <h4>${esc(product.name)}</h4>
          <div class="price">${rp(product.price)}</div>
          <div class="small">Stok ${Number(product.stock || 0)} · ${esc(product.barcode)}</div>
        </button>`).join('');
      box.querySelectorAll('[data-code]').forEach(button => {
        button.onclick = () => add(button.dataset.code);
      });
    }

    function refreshProducts() {
      products = load(STORE.products, []);
      const validIds = new Set(products.map(product => product.id));
      cart = cart
        .filter(item => validIds.has(item.id))
        .map(item => {
          const current = products.find(product => product.id === item.id);
          return current ? { ...current, qty: Math.min(item.qty, Number(current.stock || 0)) } : item;
        })
        .filter(item => item.qty > 0);
      quick();
      render();
    }

    $('scanForm').addEventListener('submit', event => {
      event.preventDefault();
      const input = $('scan');
      const code = input.value;
      if (add(code)) input.value = '';
      input.focus();
    });

    // Beberapa scanner mengirim Enter sebagai keydown sebelum submit form.
    $('scan').addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        $('scanForm').requestSubmit();
      }
    });

    $('cash').addEventListener('input', change);
    $('clear').addEventListener('click', () => {
      cart = [];
      $('cash').value = '';
      render();
      $('scan').focus();
    });

    $('checkout').addEventListener('click', () => {
      const cashReceived = Number($('cash').value || 0);
      const transactionTotal = total();
      if (!cart.length) return toast('Keranjang masih kosong.');
      if (cashReceived < transactionTotal) return toast('Uang diterima kurang.');

      const now = new Date();
      const sale = {
        id: 'TRX-' + Date.now(),
        date: now.toISOString(),
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          barcode: item.barcode,
          qty: item.qty,
          price: Number(item.price || 0),
          cost: Number(item.cost || 0),
          total: Number(item.price || 0) * item.qty
        })),
        total: transactionTotal,
        cash: cashReceived,
        change: cashReceived - transactionTotal
      };

      const sales = load(STORE.sales, []);
      sales.push(sale);
      save(STORE.sales, sales);

      products.forEach(product => {
        const sold = cart.find(item => item.id === product.id);
        if (sold) product.stock = Math.max(0, Number(product.stock || 0) - sold.qty);
      });
      save(STORE.products, products);

      const cash = load(STORE.cash, []);
      cash.push({
        id: sale.id,
        date: sale.date,
        type: 'penjualan',
        amount: transactionTotal,
        desc: 'Penjualan ' + cart.map(item => `${item.name} x${item.qty}`).join(', '),
        saleId: sale.id
      });
      save(STORE.cash, cash);

      const rows = cart.map(item =>
        `<div style="display:flex;justify-content:space-between"><span>${esc(item.name)} x${item.qty}</span><span>${rp(item.price * item.qty)}</span></div>`
      ).join('');

      const receiptWindow = window.open('', '_blank', 'width=430,height=650');
      if (receiptWindow) {
        // Jangan menaruh literal </script> di source HTML utama; struk ditulis setelah JS berjalan.
        const receiptScript = '<' + '/script>';
        receiptWindow.document.write(`<!doctype html><html><body style="font-family:monospace;padding:20px">
          <h2 style="text-align:center">KASIRTOKO</h2>
          <div>${now.toLocaleString('id-ID')}</div><hr>${rows}<hr>
          <div style="display:flex;justify-content:space-between"><b>TOTAL</b><b>${rp(transactionTotal)}</b></div>
          <div style="display:flex;justify-content:space-between">Bayar <span>${rp(cashReceived)}</span></div>
          <div style="display:flex;justify-content:space-between">Kembali <span>${rp(cashReceived - transactionTotal)}</span></div>
          <hr><p style="text-align:center">Terima kasih 🙏</p>
          <script>window.onload=()=>setTimeout(()=>window.print(),200)${receiptScript}
        </body></html>`);
        receiptWindow.document.close();
      }

      cart = [];
      $('cash').value = '';
      render();
      quick();
      toast('Transaksi tercatat otomatis ✅');
      $('scan').focus();
    });

    window.addEventListener('storage', refreshProducts);
    window.addEventListener('webpkm:data-change', event => {
      if (event.detail?.name === 'products' || !event.detail?.name) refreshProducts();
    });

    quick();
    render();
    $('scan').focus();
  };

  if (window.KasirAuth?.ready) boot();
  else window.addEventListener('load', boot, { once: true });
})();
