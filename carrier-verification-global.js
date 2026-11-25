(function () {
  const SUPABASE_URL = 'https://bavkbjdxnyciptybilyv.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_of5cVcLjILPR1QHK8qVQhw_GHxOPbsu';
  const STORAGE_BUCKET = 'carrier-docs';
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

  const toggleEditBtn = document.getElementById('toggleEditBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const profileStatusEl = document.getElementById('profileStatusText');
  const profileErrorEl = document.getElementById('profileErrorBox');
  const mcDocStatusEl = document.getElementById('mcDocStatusText');

  const fullNameInput = document.getElementById('userFullNameInput');
  const emailInput = document.getElementById('userEmailInput');
  const companyInput = document.getElementById('userCompanyInput');
  const mcNumberInput = document.getElementById('mcNumberInput');
  const dotNumberInput = document.getElementById('dotNumberInput');
  const mcDocInput = document.getElementById('mcDocInput');

  const editableFields = [
    fullNameInput,
    emailInput,
    companyInput,
    mcNumberInput,
    dotNumberInput
  ].filter(Boolean);

  let currentUser = null;
  let currentProfile = null;
  let currentSubscription = null;

  function showError(msg) {
    if (!profileErrorEl) {
      alert(msg);
      return;
    }
    profileErrorEl.textContent = msg;
    profileErrorEl.classList.remove('hidden');
  }

  function clearError() {
    if (!profileErrorEl) return;
    profileErrorEl.textContent = '';
    profileErrorEl.classList.add('hidden');
  }

  function setEditing(isEditing) {
    editableFields.forEach((el) => {
      el.disabled = !isEditing;
    });
    if (mcDocInput) {
      mcDocInput.disabled = !isEditing;
    }
    if (toggleEditBtn) {
      toggleEditBtn.textContent = isEditing ? 'Cancel' : 'Edit Profile';
    }
    if (saveProfileBtn) {
      saveProfileBtn.classList.toggle('hidden', !isEditing);
    }
  }

  function normalizeId(val) {
    return (val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function computeSha256Hex(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function getHeaders(extra = {}) {
    const token = window.__LOADAGENT_ACCESS_TOKEN__ || SUPABASE_PUBLISHABLE_KEY;
    return {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...extra
    };
  }

  function getFallbackAppSessionUser() {
    try {
      const raw = localStorage.getItem('loadagent_session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.isLoggedIn) {
        const email = String(parsed.email || '').trim();
        return {
          id: email || 'loadagent_user',
          email: email,
          name: String(parsed.name || '').trim()
        };
      }
    } catch (_) {}
    return null;
  }

  function renderState() {
    const usedFree = Number(currentProfile?.free_counteroffers_used || 0);
    const isVerified = Boolean(currentProfile?.is_verified);
    const hasActivePayment = currentSubscription?.payment_status === 'active';
    const statusText =
      currentProfile?.status || (currentUser ? 'Pending Verification' : 'Sign In Required');

    if (profileStatusEl) {
      profileStatusEl.textContent = `Account Status: ${statusText}`;
      profileStatusEl.className =
        'text-xs mt-0.5 font-medium ' +
        (isVerified
          ? 'text-emerald-400'
          : statusText.startsWith('Rejected')
          ? 'text-red-400'
          : 'text-amber-400');
    }

    if (currentProfile) {
      if (fullNameInput && currentProfile.full_name) fullNameInput.value = currentProfile.full_name;
      if (emailInput && currentProfile.email) emailInput.value = currentProfile.email;
      if (companyInput && currentProfile.company_name) companyInput.value = currentProfile.company_name;
      if (mcNumberInput && currentProfile.mc_number !== undefined) {
        mcNumberInput.value = currentProfile.mc_number || '';
      }
      if (dotNumberInput && currentProfile.dot_number !== undefined) {
        dotNumberInput.value = currentProfile.dot_number || '';
      }
    } else if (currentUser) {
      if (fullNameInput && !fullNameInput.value && currentUser.name) {
        fullNameInput.value = currentUser.name;
      }
      if (emailInput && !emailInput.value && currentUser.email) {
        emailInput.value = currentUser.email;
      }
    }

    if (mcDocStatusEl) {
      const docLabel = currentProfile?.doc_path
        ? 'Document stored privately'
        : 'No document uploaded yet';
      mcDocStatusEl.textContent = `${docLabel} • Free counteroffers used: ${usedFree}/5${
        hasActivePayment ? ' • Plan Active' : ''
      }`;
    }
  }

  async function loadSessionAndProfile() {
    try {
      currentUser = null;
      const client = window.supabase?.createClient
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
        : null;

      if (client && client.auth) {
        const { data } = await client.auth.getSession();
        const session = data?.session || null;
        if (session?.user && session?.access_token) {
          currentUser = session.user;
          window.__LOADAGENT_ACCESS_TOKEN__ = session.access_token;
        }
      }

      if (!currentUser) {
        currentUser = getFallbackAppSessionUser();
      }

      if (!currentUser) {
        currentProfile = null;
        currentSubscription = null;
        renderState();
        return;
      }

      if (window.__LOADAGENT_ACCESS_TOKEN__ && currentUser.id) {
        const profRes = await fetch(
          `${SUPABASE_URL}/rest/v1/carrier_profiles?user_id=eq.${encodeURIComponent(
            currentUser.id
          )}&select=*`,
          { headers: getHeaders() }
        );
        if (profRes.ok) {
          const rows = await profRes.json();
          currentProfile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        }

        const subRes = await fetch(
          `${SUPABASE_URL}/rest/v1/carrier_subscriptions?user_id=eq.${encodeURIComponent(
            currentUser.id
          )}&select=*`,
          { headers: getHeaders() }
        );
        if (subRes.ok) {
          const subRows = await subRes.json();
          currentSubscription = Array.isArray(subRows) && subRows.length > 0 ? subRows[0] : null;
        }
      }
    } catch (_) {}

    renderState();
  }

  async function uploadDocumentToPrivateBucket(file, docHash) {
    const ext = (file.name.split('.').pop() || 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const safeName = `${Date.now()}_${docHash.slice(0, 12)}.${ext || 'bin'}`;
    const objectPath = `${currentUser.id}/${safeName}`;

    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(
        objectPath
      ).replace(/%2F/g, '/')}`,
      {
        method: 'POST',
        headers: {
          ...getHeaders({
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'true'
          })
        },
        body: file
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Document upload failed.');
    }

    return objectPath;
  }

  async function handleSave() {
    clearError();

    if (!currentUser) {
      currentUser = getFallbackAppSessionUser();
    }

    if (!currentUser) {
      return showError(
        'Please sign in to your account first so your carrier profile and document are saved securely.'
      );
    }

    const fullName = (fullNameInput?.value || '').trim();
    const email = (emailInput?.value || currentUser.email || '').trim();
    const companyName = (companyInput?.value || '').trim();
    const mcRaw = (mcNumberInput?.value || '').trim();
    const dotRaw = (dotNumberInput?.value || '').trim();

    if (!fullName || !email || !companyName) {
      return showError('Please fill in Full Name, Email Address, and Company / Dispatch Name.');
    }

    if (!normalizeId(mcRaw) && !normalizeId(dotRaw)) {
      return showError(
        'Please enter at least an MC Number or a DOT Number (both are also allowed).'
      );
    }

    const selectedFile = mcDocInput?.files?.[0] || null;
    if (!selectedFile && !currentProfile?.doc_path) {
      return showError(
        'Verification Required: Please upload your MC Certificate or Authority document.'
      );
    }

    let docPath = currentProfile?.doc_path || '';
    let docHash = currentProfile?.doc_hash || '';

    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_BYTES) {
        return showError('File size must be 5 MB or less.');
      }
      if (fileIsInvalidType(selectedFile)) {
        return showError('Only PDF, PNG, JPG, or WEBP documents are allowed.');
      }
      docHash = await computeSha256Hex(selectedFile);
      if (window.__LOADAGENT_ACCESS_TOKEN__) {
        docPath = await uploadDocumentToPrivateBucket(selectedFile, docHash);
      } else {
        docPath = `verified_session/${currentUser.id}/${selectedFile.name}`;
      }
    }

    function fileIsInvalidType(f) {
      return Boolean(f.type && !ALLOWED_TYPES.includes(f.type));
    }

    const payload = {
      user_id: currentUser.id,
      full_name: fullName,
      email: email,
      company_name: companyName,
      mc_number: mcRaw || null,
      dot_number: dotRaw || null,
      doc_path: docPath,
      doc_hash: docHash,
      status: 'Pending Verification',
      is_verified: false,
      free_counteroffers_used: Number(currentProfile?.free_counteroffers_used || 0)
    };

    if (window.__LOADAGENT_ACCESS_TOKEN__) {
      const isUpdate = Boolean(currentProfile?.user_id);
      const endpoint = isUpdate
        ? `${SUPABASE_URL}/rest/v1/carrier_profiles?user_id=eq.${encodeURIComponent(
            currentUser.id
          )}`
        : `${SUPABASE_URL}/rest/v1/carrier_profiles`;

      const res = await fetch(endpoint, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: getHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        }),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const code = errBody?.code || '';
        const message = String(errBody?.message || '');

        if (
          code === '23505' ||
          message.toLowerCase().includes('unique') ||
          message.toLowerCase().includes('duplicate')
        ) {
          return showError(
            'Duplicate Rejected: This MC number, DOT number, or uploaded document is already registered in the system.'
          );
        }
        return showError(errBody?.message || 'Could not save verification profile.');
      }

      const savedRows = await res.json().catch(() => []);
      currentProfile =
        Array.isArray(savedRows) && savedRows.length > 0 ? savedRows[0] : payload;
    } else {
      currentProfile = payload;
    }

    renderState();
    setEditing(false);
    alert(
      'Submitted for review! Status is Pending Verification. Demo and up to 5 free counteroffers remain available until full verification.'
    );
  }

  window.LoadAgentAccess = {
    canUseFreeCounteroffer: function () {
      return Number(currentProfile?.free_counteroffers_used || 0) < 5;
    },
    canAccessPaidFeatures: function () {
      return (
        Boolean(currentProfile?.is_verified) &&
        currentSubscription?.payment_status === 'active'
      );
    },
    consumeFreeCounteroffer: async function () {
      const used = Number(currentProfile?.free_counteroffers_used || 0);
      if (used >= 5) return false;
      if (!currentUser || !currentProfile) return false;

      const nextUsed = used + 1;
      if (window.__LOADAGENT_ACCESS_TOKEN__) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/carrier_profiles?user_id=eq.${encodeURIComponent(
            currentUser.id
          )}`,
          {
            method: 'PATCH',
            headers: getHeaders({
              'Content-Type': 'application/json',
              Prefer: 'return=representation'
            }),
            body: JSON.stringify({ free_counteroffers_used: nextUsed })
          }
        );

        if (!res.ok) return false;
        const updated = await res.json().catch(() => []);
        currentProfile =
          Array.isArray(updated) && updated.length > 0
            ? updated[0]
            : { ...currentProfile, free_counteroffers_used: nextUsed };
      } else {
        currentProfile = { ...currentProfile, free_counteroffers_used: nextUsed };
      }

      renderState();
      return true;
    }
  };

  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', () => {
      clearError();
      const currentlyDisabled = editableFields[0] ? editableFields[0].disabled : true;
      setEditing(currentlyDisabled);
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      try {
        await handleSave();
      } catch (err) {
        showError(err?.message || 'Unexpected verification error.');
      }
    });
  }

  window.addEventListener('storage', () => {
    loadSessionAndProfile();
  });

  setEditing(false);
  loadSessionAndProfile();
})();
