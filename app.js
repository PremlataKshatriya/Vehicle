document.addEventListener("DOMContentLoaded", () => { loadLiveFleetData(); loadAuditLogs(); });

function loadLiveFleetData() {
    fetch('/api/fleet').then(res => res.json()).then(data => renderDashboard(data)).catch(err => console.error(err));
}

function renderDashboard(fleetData) {
    const tbody = document.getElementById("fleetTableBody");
    const alertList = document.getElementById("alertList");
    let [totalCount, alertCount, secureCount, criticalIssues] = [fleetData.length, 0, 0, false];
    
    const today = new Date();
    const horizon = new Date(); horizon.setDate(today.getDate() + 30);
    tbody.innerHTML = ""; alertList.innerHTML = "";

    fleetData.forEach(vehicle => {
        const insDate = new Date(vehicle.insurance_expiry);
        const fitDate = new Date(vehicle.fitness_expiry);
        const regNo = vehicle.reg_number;
        const insIso = vehicle.insurance_expiry.split('T')[0];
        const fitIso = vehicle.fitness_expiry.split('T')[0];

        let [insStatus, fitStatus, issues] = ["Active", "Active", []];
        if (insDate < today) { insStatus = "Expired"; issues.push("Insurance EXPIRED"); }
        else if (insDate <= horizon) { insStatus = "Expiring"; issues.push("Insurance due soon"); }
        
        if (fitDate < today) { fitStatus = "Expired"; issues.push("Fitness EXPIRED"); }
        else if (fitDate <= horizon) { fitStatus = "Expiring"; issues.push("Fitness due soon"); }

        let rowClass = (insStatus==="Expired"||fitStatus==="Expired") ? "highlight-danger" : 
                       (insStatus==="Expiring"||fitStatus==="Expiring") ? "highlight-warning" : "";
        if(rowClass) alertCount++; else secureCount++;

        const tr = document.createElement("tr");
        if(rowClass) tr.classList.add(rowClass);

        tr.innerHTML = `
            <td><strong>${regNo}</strong></td>
            <td><input type="date" value="${insIso}" id="ins-${regNo}" disabled class="table-inline-input"></td>
            <td><input type="date" value="${fitIso}" id="fit-${regNo}" disabled class="table-inline-input"></td>
            <td><span class="badge ${rowClass? (rowClass==='highlight-danger'?'expired':'warning'):'active'}">${rowClass?'Action Required':'Active'}</span></td>
            <td>
                <button class="btn-inline-edit" id="btn-edit-${regNo}" onclick="toggleInlineEdit('${regNo}')">✏️ Edit</button>
                <button class="btn-inline-save" id="btn-save-${regNo}" style="display:none;" onclick="saveInlineRow('${regNo}')">💾 Save</button>
            </td>
        `;
        tbody.appendChild(tr);

        if (issues.length > 0) {
            criticalIssues = true;
            issues.forEach(i => alertList.innerHTML += `<li><strong>${regNo}</strong>: ${i}</li>`);
        }
    });

    document.getElementById("kpiTotal").innerText = totalCount;
    document.getElementById("kpiAlert").innerText = alertCount;
    document.getElementById("kpiSecure").innerText = secureCount;
    if (criticalIssues) document.getElementById("alertModal").classList.add("show-modal");
}

function toggleInlineEdit(regNo) {
    document.getElementById(`ins-${regNo}`).disabled = false;
    document.getElementById(`fit-${regNo}`).disabled = false;
    document.getElementById(`btn-edit-${regNo}`).style.display = "none";
    document.getElementById(`btn-save-${regNo}`).style.display = "inline-block";
}

function saveInlineRow(regNo) {
    const insurance_expiry = document.getElementById(`ins-${regNo}`).value;
    const fitness_expiry = document.getElementById(`fit-${regNo}`).value;

    fetch('/api/fleet/update-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_number: regNo, insurance_expiry, fitness_expiry })
    }).then(res => res.json()).then(result => {
        if(result.success) { loadLiveFleetData(); loadAuditLogs(); }
    });
}

function filterFleetLedger() {
    const input = document.getElementById("tableSearchBox").value.toUpperCase();
    document.querySelectorAll("#fleetTableBody tr").forEach(row => {
        row.style.display = row.cells[0].innerText.toUpperCase().includes(input) ? "" : "none";
    });
}

function loadAuditLogs() {
    fetch('/api/audit-logs').then(res => res.json()).then(logs => {
        const body = document.getElementById("auditTableBody"); body.innerHTML = "";
        logs.forEach(log => {
            body.innerHTML += `<tr><td><small>${new Date(log.created_at).toLocaleString()}</small></td><td><span class="badge active">${log.performed_by}</span></td><td><strong>${log.action_type}</strong></td><td><span style="color:#475569">${log.details}</span></td></tr>`;
        });
    });
}
function closeModal() { document.getElementById("alertModal").classList.remove("show-modal"); }
