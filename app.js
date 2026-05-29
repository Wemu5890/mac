const { driver } = window.driver.js;

function startGuide() {
    // 获取当前显示的是哪个标签页
    const activeTab = document.querySelector('.tab-content[style*="display: block"]')?.id || document.querySelector('.tab-content.active')?.id || 'teacher-workspace';
    
    let steps = [];
    if (activeTab === 'teacher-workspace') {
        steps = [
            { element: '#drop-zone', popover: { title: '上传模板', description: '上传标准 Excel 模板，系统自动解析列结构。' } },
            { element: '#btn-update-from-excel', popover: { title: '上传更新', description: '上传不规则的教师更新表，系统自动与模板匹配。' } }
        ];
    } else if (activeTab === 'student-workspace') {
        steps = [
            { element: '#student-smart-zone', popover: { title: '一键拖拽', description: '将包含3个表的文件夹拖入，系统自动分拣，无需逐个选择。' } },
            { element: '#btn-student-generate', popover: { title: '智能生成', description: '自动计算考号、匹配分班，一键生成完整模板。' } }
        ];
    } else if (activeTab === 'rfid-workspace') {
        steps = [
            { element: '#rfid-excel-zone', popover: { title: '上传表格', description: '上传包含“二维码”列的学生 Excel 文件。' } },
            { element: '#rfid-verify-input', popover: { title: '硬件核对', description: '使用感应器扫描芯片，系统将自动匹配学生并高亮表格。' } }
        ];
    }

    const d = driver({
        showProgress: true,
        steps: steps,
        // 关键视觉优化：让指引框更漂亮且居中
        popoverClass: 'custom-driver-popover' 
    });
    d.drive();
}

window.addEventListener('load', () => {
    if (!localStorage.getItem('guide_shown')) {
        setTimeout(startGuide, 1000);
        localStorage.setItem('guide_shown', 'true');
    }
});

let isRfidVerified = false;

function showTab(tabId) {
    // 隐藏所有面板
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    // 取消所有按钮高亮
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // 隐藏全局表格（如果有）
    const ws = document.getElementById('workspace-section');
    if (ws) ws.classList.add('hidden');
    
    // 如果是教师维护页面，重新显示上传区
    if (tabId === 'teacher-workspace') {
        const upload = document.getElementById('upload-section');
        if (upload) upload.classList.remove('hidden');
    }
    
    // 显示目标面板
    document.getElementById(tabId).style.display = 'block';
    // 激活对应按钮
    event.currentTarget.classList.add('active');
}

const requiredFields = [
    '教师编号', '姓名', '手机号码', '所教学科', '所教年级', '所教行政班级', '所教教学班级'
];

let globalWorkbook = null;
let globalWorksheet = null;
let headerRowIndex = -1;
let headerRowData = [];
let bodyData = [];

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    
    const icon = type === 'success' ? '✅' : '❌';
    const color = type === 'success' ? 'var(--success-color)' : '#EF4444';
    
    toast.innerHTML = `<span class="toast-icon" style="color: ${color}">${icon}</span><span>${message}</span>`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function checkForUpdates() {
    try {
        const response = await fetch('/api/check_update');
        const data = await response.json();
        if (data.has_update) {
            const modal = document.getElementById('update-modal');
            const msg = document.getElementById('update-message');
            const btnConfirm = document.getElementById('btn-confirm-update');
            const btnCancel = document.getElementById('btn-cancel-update');
            
            msg.textContent = `发现新版本 ${data.latest_version}，是否立即更新？`;
            modal.classList.remove('hidden');
            
            btnCancel.onclick = () => modal.classList.add('hidden');
            btnConfirm.onclick = async () => {
                btnConfirm.disabled = true;
                btnConfirm.textContent = '正在下载...';
                try {
                    const res = await fetch('/api/do_update', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ download_url: data.download_url })
                    });
                    const updateRes = await res.json();
                    alert(updateRes.message || '更新指令下发成功！');
                } catch (e) {
                    alert('下载更新失败：' + e.message);
                } finally {
                    modal.classList.add('hidden');
                    btnConfirm.disabled = false;
                    btnConfirm.textContent = '立即更新';
                }
            };
        }
    } catch (e) {
        console.error('检查更新失败', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 启动即检查更新
    checkForUpdates();

    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('click', function(e) {
            e.target.value = ''; 
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
    }

    const btnReupload = document.getElementById('btn-reupload-template');
    if (btnReupload) {
        btnReupload.addEventListener('click', () => {
            fileInput.click();
        });
    }

    document.getElementById('btn-batch-apply').addEventListener('click', handleBatchApply);
    document.getElementById('btn-export').addEventListener('click', handleExport);

    const btnParseText = document.getElementById('btn-parse-text');
    const pasteInput = document.getElementById('paste-input');
    if (btnParseText && pasteInput) {
        btnParseText.addEventListener('click', () => {
            const text = pasteInput.value.trim();
            if (!text) {
                alert('请先在文本框内粘贴需要识别的数据！');
                return;
            }
            const lines = text.split('\n').map(l => l.replace(/\s+/g, ''));
            parseTextAndFill(lines, text);
            pasteInput.value = '';
        });
    }

    const driver = window.driver.js.driver;
    const tour = driver({
        showProgress: true,
        animate: true,
        doneBtnText: '我知道了',
        closeBtnText: '关闭',
        nextBtnText: '下一步 &rarr;',
        prevBtnText: '&larr; 上一步',
        steps: [
            {
                element: '#drop-zone',
                popover: {
                    title: '第一步：上传系统模板',
                    description: '点击或拖拽您需要维护的教师基础信息标准 Excel 模板，系统将闪电完成底层解析架构搭建。',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#btn-update-from-excel',
                popover: {
                    title: '第二步：上传更新比对表',
                    description: '点击此处导入老师给您的各种非标准不规则表格（如特定排班表、更新表），系统将全自动提取增量、模糊匹配，自动将新教师高亮置顶！',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#table-head-row',
                popover: {
                    title: '第三步：一键整列修改',
                    description: '当表格渲染出来后，你可以直接点击这里的任意【表头】（例如“所教学科”），即可呼出弹窗，将整个列快速刷成同一个值。',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#btn-export',
                popover: {
                    title: '第四步：导出成片',
                    description: '确认数据全部更新无误后，点击这里即可导出最新的 Excel 文件，原生样式会被 100% 保联！',
                    side: 'left',
                    align: 'center'
                }
            }
        ]
    });

    const btnGuide = document.getElementById('btn-start-guide');
    if (btnGuide) {
        btnGuide.addEventListener('click', () => {
            tour.drive();
        });
    }

    const tableFilterInput = document.getElementById('global-table-filter');
    if (tableFilterInput) {
        tableFilterInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            const tableRows = document.querySelectorAll('#table-body tr'); 
            
            tableRows.forEach(row => {
                const rowText = row.textContent.toLowerCase();
                if (rowText.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    const btnUpdateExcel = document.getElementById('btn-update-from-excel');
    const updateFileInput = document.getElementById('update-file-input');
    
    if (btnUpdateExcel && updateFileInput) {
        btnUpdateExcel.addEventListener('click', () => updateFileInput.click());
        
        updateFileInput.addEventListener('click', function(e) {
            e.target.value = ''; 
        });

        updateFileInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            showLoading('正在极速解析更新表格...');
            
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/api/upload', { method: 'POST', body: formData });
                const result = await response.json();
                
                if (result.error) throw new Error(result.error);
                
                const newHeaders = result.headerRowData;
                const newData = result.bodyData;

                let newIdCol = -1, newNameCol = -1, newPhoneCol = -1, newSubjectCol = -1, newGradeCol = -1, newClassCol = -1, newRoleCol = -1;
                newHeaders.forEach((h, i) => {
                    const text = String(h || '').trim();
                    if (text.includes('编号') || text.includes('工号') || text.includes('序号')) newIdCol = i;
                    else if (text.includes('姓名') || text === '老师') newNameCol = i;
                    else if (text.includes('手机') || text.includes('电话') || text.includes('联系方式')) newPhoneCol = i;
                    else if (text.includes('学科') && !text.includes('是否')) newSubjectCol = i;
                    else if (text.includes('年级') && !text.includes('是否')) newGradeCol = i;
                    else if (text.includes('班级') || text === '班') newClassCol = i;
                    else if (text.includes('角色') || text.includes('管理员')) newRoleCol = i;
                });

                if (newIdCol === -1 && newNameCol === -1) {
                    alert('匹配失败：更新的表格中未找到“编号”或“姓名”列，无法进行身份比对！');
                    hideLoading();
                    return;
                }

                let domIdCol = -1, domNameCol = -1, domPhoneCol = -1, domSubjIdx = -1, domGradeIdx = -1, domClassIdx = -1, domAdminIdx = -1;
                headerRowData.forEach((h, i) => {
                    const t = String(h || '').trim();
                    if (t.includes('编号') || t.includes('工号') || t.includes('序号')) domIdCol = i;
                    if (t.includes('姓名') || t === '老师') domNameCol = i;
                    if (t.includes('手机') || t.includes('电话') || t.includes('联系方式') || t.includes('号码')) domPhoneCol = i;
                    if (t.includes('学科') && !t.includes('是否')) domSubjIdx = i;
                    if (t.includes('年级') && !t.includes('是否')) domGradeIdx = i;
                    if (t.includes('行政班级') || t === '班级') domClassIdx = i;
                    if (t.includes('是否管理员') || t === '角色') domAdminIdx = i;
                });

                let updateCount = 0;
                let addCount = 0;
                let virtualRowCounter = -1;

                newData.forEach(rowObj => {
                    const row = rowObj.cells;
                    const rowId = newIdCol !== -1 ? String(row[newIdCol] || '').trim() : '';
                    const rowName = newNameCol !== -1 ? String(row[newNameCol] || '').trim() : '';

                    let matchedBodyRow = null;
                    for (let i = 0; i < bodyData.length; i++) {
                        const bRow = bodyData[i].cells;
                        const currId = domIdCol !== -1 ? String(bRow[domIdCol] || '').trim() : '';
                        const currName = domNameCol !== -1 ? String(bRow[domNameCol] || '').trim() : '';

                        if (domIdCol !== -1 && newIdCol !== -1 && currId && rowId && currId === rowId) {
                            matchedBodyRow = bodyData[i];
                            break;
                        }
                        if (domNameCol !== -1 && newNameCol !== -1 && currName && rowName && currName === rowName) {
                            matchedBodyRow = bodyData[i];
                            break;
                        }
                    }

                    let parsedSubj = newSubjectCol !== -1 && row[newSubjectCol] ? row[newSubjectCol].toString().trim() : '';
                    let parsedGrade = newGradeCol !== -1 && row[newGradeCol] ? row[newGradeCol].toString().trim() : '';
                    let parsedClass = newClassCol !== -1 && row[newClassCol] ? row[newClassCol].toString().replace(/[oO]/ig, '0').replace('班', '').trim() : '';
                    let parsedRole = newRoleCol !== -1 && row[newRoleCol] ? row[newRoleCol].toString().trim() : '';
                    let parsedPhone = newPhoneCol !== -1 && row[newPhoneCol] ? row[newPhoneCol].toString().trim() : '';

                    let isAll = false;
                    
                    if (parsedSubj) {
                        const parts = parsedSubj.split(/[,，\s]+/).filter(Boolean);
                        if (parts.length >= 2 || parsedSubj.includes('全部')) isAll = true;
                    }
                    if (parsedGrade) {
                        const parts = parsedGrade.split(/[,，\s]+/).filter(Boolean);
                        if (parts.length >= 2 || parsedGrade.includes('全部')) isAll = true;
                    }
                    
                    if (isAll) {
                        parsedSubj = '全部学科';
                        parsedGrade = '全部年级';
                        parsedRole = '是'; // 连锁触发管理员
                    }
                    
                    let adminResult = '';
                    if (parsedRole.includes('管理员') || parsedRole === '是') {
                        adminResult = headerRowData[domAdminIdx] === '角色' ? '管理员' : '是';
                    }

                    if (matchedBodyRow) {
                        let rowUpdated = false;
                        const targetCells = matchedBodyRow.cells;
                        
                        if (domPhoneCol !== -1 && parsedPhone) { targetCells[domPhoneCol] = parsedPhone; rowUpdated = true; }
                        
                        if (domSubjIdx !== -1 && parsedSubj) {
                            if (isAll || parsedSubj !== '全部学科') { targetCells[domSubjIdx] = parsedSubj; rowUpdated = true; }
                        }
                        
                        if (domGradeIdx !== -1 && parsedGrade) {
                            if (isAll || parsedGrade !== '全部年级') { targetCells[domGradeIdx] = parsedGrade; rowUpdated = true; }
                        }
                        
                        if (domClassIdx !== -1 && parsedClass && parsedClass !== '全部') {
                            targetCells[domClassIdx] = parsedClass; rowUpdated = true; 
                        }
                        
                        if (domAdminIdx !== -1 && adminResult) {
                            targetCells[domAdminIdx] = adminResult; rowUpdated = true;
                        }

                        if (rowUpdated) {
                            matchedBodyRow._isUpdated = true;
                            updateCount++;
                        }
                    } else {
                        // 全新添加的教师，打上标记并追加
                        const newCells = new Array(headerRowData.length).fill('');
                        if (domIdCol !== -1 && newIdCol !== -1) newCells[domIdCol] = rowId;
                        if (domNameCol !== -1 && newNameCol !== -1) newCells[domNameCol] = rowName;
                        
                        if (domPhoneCol !== -1 && parsedPhone) newCells[domPhoneCol] = parsedPhone;
                        if (domSubjIdx !== -1 && parsedSubj) {
                            if (isAll || parsedSubj !== '全部学科') newCells[domSubjIdx] = parsedSubj;
                        }
                        if (domGradeIdx !== -1 && parsedGrade) {
                            if (isAll || parsedGrade !== '全部年级') newCells[domGradeIdx] = parsedGrade;
                        }
                        if (domClassIdx !== -1 && parsedClass && parsedClass !== '全部') newCells[domClassIdx] = parsedClass;
                        if (domAdminIdx !== -1 && adminResult) newCells[domAdminIdx] = adminResult;
                        
                        bodyData.push({
                            excelRowNumber: virtualRowCounter,
                            cells: newCells,
                            _isNew: true
                        });
                        virtualRowCounter--;
                        addCount++;
                    }
                });

                if (addCount > 0) {
                    bodyData.sort((a, b) => {
                        if (a._isNew && !b._isNew) return -1;
                        if (!a._isNew && b._isNew) return 1;
                        return 0;
                    });
                }

                renderWorkspace(headerRowData, bodyData);
                
                const tableRows = document.querySelectorAll('#table-body tr');
                tableRows.forEach(tr => {
                    const rowObj = bodyData.find(r => r.excelRowNumber == tr.dataset.excelRow);
                    if (rowObj && rowObj._isUpdated) {
                        tr.style.transition = 'background-color 0.5s';
                        tr.style.backgroundColor = '#dcfce3'; 
                        setTimeout(() => tr.style.backgroundColor = '', 3000);
                        delete rowObj._isUpdated; 
                    }
                });

                if (addCount > 0) {
                    showToast(addCount);
                }

                const newCountBadge = document.getElementById('new-teachers-count');
                if (newCountBadge) {
                    if (addCount > 0) {
                        newCountBadge.textContent = `✨ 新增教师: ${addCount}`;
                        newCountBadge.style.display = 'inline-flex';
                    } else {
                        newCountBadge.textContent = '✨ 新增教师: 0';
                        newCountBadge.style.display = 'none';
                    }
                }

                updateFileInput.value = ''; 
                alert(`比对完成！成功利用新表格更新了 ${updateCount} 名现有教师的数据${addCount > 0 ? `，并新增了 ${addCount} 名教师` : ''}。`);
            } catch (err) {
                alert('解析更新表格失败：' + err.message);
            } finally {
                hideLoading();
            }
        });
    }
});

let currentSessionId = null;

async function handleFile(file) {
    showLoading('正在上传并解析 Excel 文件，请稍候...');
    
    const newCountBadge = document.getElementById('new-teachers-count');
    if (newCountBadge) {
        newCountBadge.textContent = '✨ 新增教师: 0';
        newCountBadge.style.display = 'none';
    }
    
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(result.error);
            return;
        }

        currentSessionId = result.sessionId;
        headerRowData = result.headerRowData;
        bodyData = result.bodyData;

        renderWorkspace(headerRowData, bodyData);
        
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('workspace-section').classList.remove('hidden');
        
        let idColNum = -1, phoneColNum = -1;
        headerRowData.forEach((h, i) => {
            const txt = String(h || '').trim();
            if (txt.includes('编号')) idColNum = i;
            if (txt.includes('手机') || txt.includes('电话')) phoneColNum = i;
        });
        
        let duplicateIds = 0, invalidPhones = 0;
        const idSet = new Set();
        
        const tableRows = document.querySelectorAll('#table-body tr');
        tableRows.forEach(tr => {
            let isRowError = false;
            if (idColNum !== -1) {
                const idCell = tr.querySelector(`td[data-col-num="${idColNum}"]`);
                if (idCell) {
                    const idVal = idCell.textContent.trim();
                    if (idVal) {
                        if (idSet.has(idVal)) { duplicateIds++; isRowError = true; }
                        else { idSet.add(idVal); }
                    }
                }
            }
            if (phoneColNum !== -1) {
                const phoneCell = tr.querySelector(`td[data-col-num="${phoneColNum}"]`);
                if (phoneCell) {
                    const phoneVal = phoneCell.textContent.trim();
                    if (!phoneVal || !/^\d{11}$/.test(phoneVal)) { invalidPhones++; isRowError = true; }
                }
            }
            if (isRowError) tr.style.backgroundColor = '#FEF08A';
        });
        
        let notifyCard = document.getElementById('status-notification-card');
        if (!notifyCard) {
            notifyCard = document.createElement('div');
            notifyCard.id = 'status-notification-card';
            notifyCard.style.padding = '12px 20px';
            notifyCard.style.borderRadius = '12px';
            notifyCard.style.marginBottom = '15px';
            notifyCard.style.fontWeight = '500';
            notifyCard.style.fontSize = '14px';
            notifyCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
            const workspaceTopBar = document.querySelector('.workspace-top-bar');
            if (workspaceTopBar) workspaceTopBar.parentNode.insertBefore(notifyCard, workspaceTopBar);
        }
        
        if (duplicateIds > 0 || invalidPhones > 0) {
            notifyCard.style.backgroundColor = '#FEF9C3';
            notifyCard.style.color = '#713F12';
            notifyCard.style.border = '1px solid #FEF08A';
            notifyCard.innerHTML = `⚠️ 检测到表格数据存在潜在异常：系统已自动为您高亮标黄！ 其中包含 <strong>${duplicateIds}</strong> 处编号重复冲突， <strong>${invalidPhones}</strong> 处手机号格式不规范（非11位纯数字）。请核对修正后再行导出。`;
        } else {
            notifyCard.style.backgroundColor = '#F0FDF4';
            notifyCard.style.color = '#166534';
            notifyCard.style.border = '1px solid #BBF7D0';
            notifyCard.innerHTML = `✨ 体检完成：当前标准模板表格未检测出任何编号冲突或手机号异常，数据格式非常健康！`;
        }
        
    } catch (err) {
        alert('解析系统模板文件失败：' + err.message);
    } finally {
        hideLoading();
    }
}

function renderWorkspace(headers, body) {
    const headRow = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    const batchColumnSelect = document.getElementById('batch-column');
    
    headRow.innerHTML = '';
    tbody.innerHTML = '';
    batchColumnSelect.innerHTML = '<option value="">-- 选择要批量更新的列 --</option>';

    const selectAllTh = document.createElement('th');
    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'select-all';
    selectAllCb.addEventListener('change', (e) => {
        const checkboxes = tbody.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedCount();
    });
    selectAllTh.appendChild(selectAllCb);
    headRow.appendChild(selectAllTh);

    for (let colNum = 1; colNum < headers.length; colNum++) {
        const header = headers[colNum];
        if (header === undefined) continue;
        
        const th = document.createElement('th');
        th.textContent = header;
        th.style.cursor = 'pointer';
        th.title = `点击统一修改全表【${header}】列`;
        
        th.addEventListener('click', () => {
            const newValue = prompt(`请输入你要为【${header}】统一设置的值：\n(确认后将应用到该列所有行。留空则清空该列，点击取消则放弃修改)`);
            if (newValue !== null) {
                const tbody = document.getElementById('table-body');
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(tr => {
                    const td = tr.querySelector(`td[data-col-num="${colNum}"]`);
                    if (td) {
                        td.textContent = newValue;
                        td.style.transition = 'background-color 0.5s';
                        td.style.backgroundColor = '#dcfce3';
                        setTimeout(() => td.style.backgroundColor = '', 1500);
                    }
                });
                alert(`整列覆盖完成！所有行的【${header}】已成功统一修改为: "${newValue}"`);
            }
        });
        
        if (requiredFields.includes(String(header).trim()) || String(header).includes('标红')) {
            th.classList.add('required-header');
        }
        headRow.appendChild(th);

        if (header && String(header).trim() !== '') {
            const option = document.createElement('option');
            option.value = colNum; 
            option.textContent = header;
            batchColumnSelect.appendChild(option);
        }
    }

    body.forEach((rowData) => {
        const tr = document.createElement('tr');
        tr.dataset.excelRow = rowData.excelRowNumber;
        
        if (rowData._isNew) {
            tr.classList.add('new-data-row');
        }

        const tdCb = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'row-checkbox';
        cb.addEventListener('change', updateSelectedCount);
        tdCb.appendChild(cb);
        tr.appendChild(tdCb);

        for (let colNum = 1; colNum < headers.length; colNum++) {
            if (headers[colNum] === undefined) continue;
            const td = document.createElement('td');
            td.textContent = rowData.cells[colNum] || '';
            td.contentEditable = "true";
            td.dataset.colNum = colNum; 
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });

    document.getElementById('row-count').textContent = `总行数: ${body.length}`;
    updateSelectedCount();
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const selectedCount = checkboxes.length;
    document.getElementById('selected-count').textContent = `已选: ${selectedCount}`;
    
    const batchTools = document.querySelector('.batch-tools');
    if (batchTools) {
        if (selectedCount > 0) {
            batchTools.style.display = 'flex';
            let msgSpan = document.getElementById('batch-selected-msg');
            if (!msgSpan) {
                msgSpan = document.createElement('span');
                msgSpan.id = 'batch-selected-msg';
                msgSpan.style.marginRight = '10px';
                msgSpan.style.color = '#2563EB';
                batchTools.insertBefore(msgSpan, batchTools.firstChild);
            }
            msgSpan.innerHTML = `⚙️ 已勾选 <strong>${selectedCount}</strong> 行教师：`;
        } else {
            batchTools.style.display = 'none';
        }
    }
}

function handleBatchApply() {
    const colNum = document.getElementById('batch-column').value;
    const newValue = document.getElementById('batch-value').value.trim();
    
    if (!colNum) {
        alert('请先选择要批量更新的列！');
        return;
    }

    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请先勾选需要批量应用修改的教师数据行！');
        return;
    }

    checkboxes.forEach(cb => {
        const tr = cb.closest('tr');
        const td = tr.querySelector(`td[data-col-num="${colNum}"]`);
        if (td) {
            td.textContent = newValue;
        }
    });

    alert(`成功更新了 ${checkboxes.length} 行数据！`);
}

async function handleExport() {
    if (!currentSessionId) {
        alert('无有效会话，请重新上传文件！');
        return;
    }

    showLoading('正在保存并导出带原生样式的 Excel 文件，请稍候...');
    
    const tbody = document.getElementById('table-body');
    const updates = [];
    
    for (let row of tbody.children) {
        let excelRowNumber = parseInt(row.dataset.excelRow);
        
        if (row.classList.contains('new-data-row')) {
            if (excelRowNumber >= 0 || isNaN(excelRowNumber)) {
                excelRowNumber = -1;
            }
        }
        
        const tds = row.querySelectorAll('td[data-col-num]');
        tds.forEach(td => {
            const colNum = parseInt(td.dataset.colNum);
            if (colNum < 1 || isNaN(colNum)) return;
            
            updates.push({
                excelRowNumber: excelRowNumber,
                colNum: colNum,
                value: td.textContent
            });
        });
    }
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: currentSessionId,
                updates: updates
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '导出失败');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '已更新数据.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
    } catch (err) {
        alert('导出失败: ' + err.message);
    } finally {
        hideLoading();
    }
}

function parseTextAndFill(lines, rawText) {
    let colSubjectIdx = -1, colGradeIdx = -1, colClassIdx = -1, colNameIdx = -1, colPhoneIdx = -1;
    
    headerRowData.forEach((h, i) => {
        const text = String(h || '').trim();
        if (text.includes('学科') && !text.includes('是否')) colSubjectIdx = i;
        if (text.includes('年级') && !text.includes('是否')) colGradeIdx = i;
        if (text.includes('班级') || text === '班') colClassIdx = i;
        if (text.includes('姓名') || text === '老师') colNameIdx = i;
        if (text.includes('手机') || text.includes('电话') || text.includes('联系方式') || text.includes('号码')) colPhoneIdx = i;
    });

    let currentSubject = '';
    let currentGrade = '';
    let currentClass = '';

    const matchedTeacherCount = new Set();

    lines.forEach(line => {
        if (!line) return;

        if (line.includes('学科:') || line.includes('学科：')) {
            currentSubject = line.split(/[:：]/)[1].trim();
            return;
        }
        if (line.includes('年级:') || line.includes('年级：')) {
            currentGrade = line.split(/[:：]/)[1].trim();
            return;
        }
        if (line.includes('班级:') || line.includes('班级：')) {
            currentClass = line.split(/[:：]/)[1].trim().replace(/[oO]/ig, '0').replace('班', '');
            return;
        }

        let targetTeacherName = '';
        if (line.includes('姓名:') || line.includes('姓名：')) {
            targetTeacherName = line.split(/[:：]/)[1].trim();
        } else if (!/^\d+$/.test(line) && line.length >= 2 && line.length <= 5) {
            targetTeacherName = line;
        }

        if (targetTeacherName) {
            const trs = document.querySelectorAll('#table-body tr');
            let matched = false;

            trs.forEach(tr => {
                const nameCell = tr.querySelector(`td[data-col-num="${colNameIdx}"]`);
                if (nameCell && nameCell.textContent.trim() === targetTeacherName) {
                    if (currentSubject && colSubjectIdx !== -1) tr.querySelector(`td[data-col-num="${colSubjectIdx}"]`).textContent = currentSubject;
                    if (currentGrade && colGradeIdx !== -1) tr.querySelector(`td[data-col-num="${colGradeIdx}"]`).textContent = currentGrade;
                    if (currentClass && colClassIdx !== -1) tr.querySelector(`td[data-col-num="${colClassIdx}"]`).textContent = currentClass;
                    
                    tr.style.transition = 'background-color 0.5s';
                    tr.style.backgroundColor = '#dcfce3';
                    setTimeout(() => tr.style.backgroundColor = '', 3000);
                    matchedTeacherCount.add(tr);
                    matched = true;
                }
            });
            if (matched) return;
        }

        if (/^\d{11}$/.test(line) && colPhoneIdx !== -1) {
            const trs = document.querySelectorAll('#table-body tr');
            trs.forEach(tr => {
                const phoneCell = tr.querySelector(`td[data-col-num="${colPhoneIdx}"]`);
                if (phoneCell && phoneCell.textContent.trim() === line) {
                    if (currentSubject && colSubjectIdx !== -1) tr.querySelector(`td[data-col-num="${colSubjectIdx}"]`).textContent = currentSubject;
                    if (currentGrade && colGradeIdx !== -1) tr.querySelector(`td[data-col-num="${colGradeIdx}"]`).textContent = currentGrade;
                    if (currentClass && colClassIdx !== -1) tr.querySelector(`td[data-col-num="${colClassIdx}"]`).textContent = currentClass;
                    
                    tr.style.transition = 'background-color 0.5s';
                    tr.style.backgroundColor = '#dcfce3';
                    setTimeout(() => tr.style.backgroundColor = '', 3000);
                    matchedTeacherCount.add(tr);
                }
            });
        }
    });

    if (matchedTeacherCount.size > 0) {
        alert(`文本解析完成！成功根据姓名或手机号智能填入了 ${matchedTeacherCount.size} 名教师的数据。`);
    } else {
        const preview = rawText ? rawText.substring(0, 150).replace(/\n/g, ' ') : '空（未提取到任何文字）';
        alert(`匹配失败！\n\n原因分析：提供的文本中没有找到能与表格里匹配的姓名或手机号，或未包含相关学科班级信息。\n\n请检查粘贴的内容是否有误！`);
    }
}

// === 学生教学班考号生成模块逻辑 ===
const smartZone = document.getElementById('student-smart-zone');
const smartInput = document.getElementById('input-student-smart');
const statusList = document.getElementById('file-status-list');
let selectedSmartFiles = [];

if (smartZone && smartInput) {
    smartZone.addEventListener('click', () => smartInput.click());
    
    // 拖拽支持
    smartZone.addEventListener('dragover', (e) => { e.preventDefault(); smartZone.style.borderColor = 'var(--primary-color)'; });
    smartZone.addEventListener('dragleave', () => { smartZone.style.borderColor = '#CBD5E1'; });
    smartZone.addEventListener('drop', (e) => {
        e.preventDefault();
        smartZone.style.borderColor = '#CBD5E1';
        if (e.dataTransfer.files.length) {
            handleSmartUpload(e.dataTransfer.files);
        }
    });

    smartInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleSmartUpload(e.target.files);
        }
    });
}

function handleSmartUpload(files) {
    selectedSmartFiles = Array.from(files).filter(f => f.name.endsWith('.xls') || f.name.endsWith('.xlsx'));
    
    let hasTmpl = false, hasMaster = false, hasClass = false;
    let html = '';
    selectedSmartFiles.forEach(f => {
        const n = f.name;
        if (n.includes('模板')) hasTmpl = true;
        if (n.includes('总表')) hasMaster = true;
        if (n.includes('名单') || n.includes('奥')) hasClass = true;
        html += `<div style="color: var(--success-color);">✅ 已识别: ${n}</div>`;
    });
    
    statusList.innerHTML = html;
    
    if (!hasTmpl || !hasMaster || !hasClass) {
        statusList.innerHTML += `<div style="color: #EF4444; margin-top: 8px;">⚠️ 提示：需要同时包含[模板]、[总表]、[名单]的Excel文件。当前识别不全，请重新选择！</div>`;
    }
}

const btnStudentGen = document.getElementById('btn-student-generate');
if (btnStudentGen) {
    btnStudentGen.addEventListener('click', async () => {
        if (selectedSmartFiles.length < 3) {
            showToast('请先选择包含“模板”、“总表”、“名单”3个文件的文件夹！', 'error');
            return;
        }

        showLoading('正在全自动分拣、联查并计算4位考号...');
        const formData = new FormData();
        selectedSmartFiles.forEach(f => formData.append('files', f));

        try {
            const response = await fetch('/api/process_students', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '生成失败');
            }
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            currentSessionId = result.sessionId;
            headerRowData = result.headerRowData;
            bodyData = result.bodyData;

            renderWorkspace(headerRowData, bodyData);
            
            const uploadSection = document.getElementById('upload-section');
            if (uploadSection) uploadSection.classList.add('hidden');
            
            const studentSection = document.getElementById('student-workspace');
            if (studentSection) studentSection.style.display = 'none';
            
            const workspaceSection = document.getElementById('workspace-section');
            if (workspaceSection) workspaceSection.classList.remove('hidden');
            
            hideLoading();
            showToast('✨ 智能匹配完成！请在下方表格中复查，确认无误后点击“导出选中行数据”。', 'success');
        } catch (err) {
            hideLoading();
            showToast('生成失败: ' + err.message, 'error');
        }
    });
}

// === RFID 处理模块交互 ===
const initRfidZone = (zoneId, inputId, nameId) => {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const nameDisp = document.getElementById(nameId);
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
        if (e.target.files.length) {
            nameDisp.textContent = e.target.files[0].name;
            nameDisp.style.color = '#10B981';
            nameDisp.style.fontWeight = '600';
            zone.style.borderColor = '#10B981';
            zone.style.backgroundColor = '#ecfdf5';
        }
    });
};

initRfidZone('rfid-excel-zone', 'input-rfid-excel', 'name-rfid-excel');
initRfidZone('rfid-txt-zone', 'input-rfid-txt', 'name-rfid-txt');

const handleRfidProcess = async (mode) => {
    const excelFile = document.getElementById('input-rfid-excel').files[0];
    const txtFile = document.getElementById('input-rfid-txt').files[0];

    if (!excelFile) {
        alert('请先上传包含“二维码”列的学生表格 (Excel)！');
        return;
    }
    if (mode === 'mode2' && !txtFile) {
        alert('模式二需要同时上传 TXT 芯片码文件！');
        return;
    }

    showLoading(mode === 'mode1' ? '正在执行模式一：保留结构生成新二维码...' : '正在执行模式二：融合RFID并重组提取表格...');
    
    const fd = new FormData();
    fd.append('excel', excelFile);
    if (txtFile) fd.append('txt', txtFile);
    fd.append('mode', mode);

    try {
        const res = await fetch('/api/process_rfid', { method: 'POST', body: fd });
        const result = await res.json();
        if (!res.ok || result.error) { 
            throw new Error(result.error || '处理失败'); 
        }
        
        isRfidVerified = false;

        // 渲染表头
        const thead = document.getElementById('rfid-table-head');
        const tbody = document.getElementById('rfid-table-body');
        thead.innerHTML = '';
        tbody.innerHTML = '';
        
        result.headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.padding = '12px 16px';
            th.style.borderBottom = '1px solid var(--border-color)';
            thead.appendChild(th);
        });
        
        // 渲染数据行
        result.rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #F1F5F9';
            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell;
                td.style.padding = '10px 16px';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        
        // 更新状态并展示成果区
        let displayCount = result.rows.length;
        document.getElementById('rfid-row-count').textContent = displayCount < result.totalRows 
            ? `预览展示: ${displayCount} 行 / 总计生成: ${result.totalRows} 行` 
            : `总共生成: ${result.totalRows} 行`;
            
        document.getElementById('rfid-result-section').style.display = 'block';
        setTimeout(() => document.getElementById('rfid-verify-input').focus(), 100);
        
        // 绑定导出按钮事件
        const btnExport = document.getElementById('btn-rfid-export');
        btnExport.onclick = () => {
            if (!isRfidVerified) {
                showToast('请先使用外设感应器扫描任意一条芯片码完成核对，以确保数据安全！', 'error');
                const d = driver();
                d.highlight({
                    element: '#rfid-verify-input',
                    popover: { title: '强制核对', description: '为了防错，系统要求导出前必须至少进行一次硬件级查验扫描。' }
                });
                return;
            }
            window.location.href = `/api/download_rfid/${result.sessionId}?mode=${mode}`;
        };
        
        let finalMsg = '✨ 恭喜：处理完成！请在下方预览表格中核对数据。';
        if (result.warning) {
            finalMsg += '\n\n⚠️ 注意：' + result.warning;
        }
        alert(finalMsg);
    } catch (err) { 
        alert('RFID处理失败: ' + err.message); 
    } finally { 
        hideLoading(); 
    }
};

document.getElementById('btn-rfid-mode1').addEventListener('click', () => handleRfidProcess('mode1'));
document.getElementById('btn-rfid-mode2').addEventListener('click', () => handleRfidProcess('mode2'));

// === 硬件级 RFID 极速核对引擎 ===
const setupRfidScanner = () => {
    const verifyInput = document.getElementById('rfid-verify-input');
    const verifyResult = document.getElementById('rfid-verify-result');
    const scannerStation = document.getElementById('rfid-scanner-station');
    let scanTimeout;

    if (!verifyInput) return;

    verifyInput.addEventListener('keypress', function(e) {
        // USB感应器会在输入完序列号后自动发送一个 Enter 键 (keyCode 13)
        if (e.key === 'Enter') {
            const code = this.value.trim();
            this.value = ''; // 极其关键：瞬间清空，为下一次毫秒级连扫做准备
            
            if (!code) return;

            const tbody = document.getElementById('rfid-table-body');
            const rows = tbody.querySelectorAll('tr');
            let foundRow = null;
            let studentName = '未知';
            let studentClass = '';

            // 清除之前的雷达高亮
            rows.forEach(r => r.style.backgroundColor = '');

            // 全局遍历搜索匹配的芯片码
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                // 假设芯片码或二维码在任意列中能匹配上
                const rowText = Array.from(cells).map(td => td.textContent.trim()).join('||');
                
                if (rowText.includes(code)) {
                    foundRow = row;
                    studentName = cells[0] ? cells[0].textContent.trim() : '未知';
                    studentClass = cells[1] ? cells[1].textContent.trim() : '';
                }
            });

            clearTimeout(scanTimeout);

            if (foundRow) {
                isRfidVerified = true;
                // 成功反馈：绿光雷达
                scannerStation.style.borderColor = 'var(--success-color)';
                scannerStation.style.backgroundColor = '#ecfdf5';
                verifyInput.style.borderColor = 'var(--success-color)';
                verifyInput.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.15)';
                
                verifyResult.innerHTML = `<span style="color: var(--success-hover);">✅ 匹配成功：${studentName} ${studentClass ? '('+studentClass+')' : ''}</span>`;
                
                // 表格雷达自动追踪滚屏
                foundRow.style.backgroundColor = '#dcfce3';
                foundRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // 失败反馈：红光警报
                scannerStation.style.borderColor = '#EF4444';
                scannerStation.style.backgroundColor = '#fef2f2';
                verifyInput.style.borderColor = '#EF4444';
                verifyInput.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.15)';
                
                verifyResult.innerHTML = `<span style="color: #DC2626;">❌ 警告：未登记的芯片码！</span>`;
            }

            // 2.5秒后自动恢复平静状态，不打断连扫
            scanTimeout = setTimeout(() => {
                scannerStation.style.borderColor = '#CBD5E1';
                scannerStation.style.backgroundColor = 'var(--bg-gradient)';
                verifyInput.style.borderColor = 'var(--border-color)';
                verifyInput.style.boxShadow = 'none';
                verifyResult.innerHTML = '<span style="color: var(--text-muted);">等待下一次感应...</span>';
            }, 2500);
        }
    });
};

// 页面加载完成后初始化监听
setupRfidScanner();