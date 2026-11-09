
export async function generatePDFReport(filterState, filteredData, selectedTrajectory, userComment = "") {
    // Ensure jsPDF is available
    if (!window.jspdf) {
        console.error("jsPDF library not found. Ensure it is included in index.html");
        alert("PDF generation library missing.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const margin = 14;
    let y = 20;
    const lineHeight = 7;
    const pageWidth = doc.internal.pageSize.getWidth();

    // Helper to check page bounds
    const checkPageBreak = (heightNeeded) => {
        if (y + heightNeeded > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = 20;
        }
    };

    // --- TITLE ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(22, 71, 115); // Dark blue like the button
    doc.text("Behaviour Rugs Trajectory Report", margin, y);
    y += 10;

    // --- DATE ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);
    y += 15;

    // --- USER COMMENT ---
    if (userComment && userComment.trim()) {
        checkPageBreak(30);
        doc.setFontSize(11);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(80);
        const commentLines = doc.splitTextToSize(`Comment: ${userComment}`, pageWidth - (margin * 2));
        doc.text(commentLines, margin, y);
        y += (commentLines.length * lineHeight) + 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
        y += 5;
    }

    // --- SUMMARY STATISTICS ---
    checkPageBreak(60);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("Summary Statistics", margin, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const totalTraj = filteredData.length;
    const uniqueUsers = new Set(filteredData.map(d => d.user_id)).size;
    const uniqueClusters = new Set(filteredData.map(d => d.cluster)).size;
    
    // Calculate averages
    const avgEntropy = (filteredData.reduce((sum, d) => sum + (parseFloat(d.shannon_entropy) || 0), 0) / (totalTraj || 1)).toFixed(2);
    const avgDwell = (filteredData.reduce((sum, d) => sum + (parseFloat(d.avg_dwell_time) || 0), 0) / (totalTraj || 1)).toFixed(2);

    const stats = [
        `Total Trajectories: ${totalTraj}`,
        `Visible Users: ${uniqueUsers}`,
        `Active Clusters: ${uniqueClusters}`,
        `Avg. Shannon Entropy: ${avgEntropy}`,
        `Avg. Dwell Time: ${avgDwell}`
    ];

    stats.forEach(stat => {
        doc.text(`• ${stat}`, margin + 5, y);
        y += lineHeight;
    });
    y += 5;

    // --- ACTIVE FILTERS ---
    checkPageBreak(50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Active Filters", margin, y);
    y += 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    let hasFilters = false;
    
    if (filterState.userId) {
        doc.text(`• User ID: ${filterState.userId}`, margin + 5, y);
        y += lineHeight;
        hasFilters = true;
    }

    if (filterState.clusterIds && filterState.clusterIds.length > 0) {
        doc.text(`• Clusters: ${filterState.clusterIds.join(", ")}`, margin + 5, y);
        y += lineHeight;
        hasFilters = true;
    }

    if (filterState.tsneIds && filterState.tsneIds.length > 0) {
        doc.text(`• t-SNE Selection: ${filterState.tsneIds.length} trajectories selected`, margin + 5, y);
        y += lineHeight;
        hasFilters = true;
    }

    if (filterState.motifConfig) {
        const { activeMotifs } = filterState.motifConfig;
        const activeM = [];
        if (activeMotifs.lento) activeM.push("Lento");
        if (activeMotifs.turn) activeM.push("Turn");
        
        const isCustomActive = activeMotifs.custom && (
            (typeof activeMotifs.custom === 'string' && activeMotifs.custom.trim() !== "") ||
            (Array.isArray(activeMotifs.custom) && activeMotifs.custom.some(p => p.speed || p.dir)) ||
            (Array.isArray(activeMotifs.custom) && activeMotifs.custom.length > 0 && activeMotifs.custom[0].pattern) // Check for array of motif objects
        );

        if (Array.isArray(activeMotifs.custom) && activeMotifs.custom.length > 0 && activeMotifs.custom[0].pattern) {
             // New structure: Array of Motif Objects
             activeMotifs.custom.forEach(m => {
                 activeM.push(m.name || "Custom Motif");
             });
        } else if (isCustomActive) {
            // Old structure or string
            activeM.push(activeMotifs.customName || "Custom Motif");
        }
        
        if (activeM.length > 0) {
             doc.text(`• Motifs: ${activeM.join(", ")}`, margin + 5, y);
             y += lineHeight;
             hasFilters = true;
        }
    }

    if (!hasFilters) {
        doc.setFont("helvetica", "italic");
        doc.text("No filters applied (showing full dataset).", margin + 5, y);
        doc.setFont("helvetica", "normal");
        y += lineHeight;
    }
    y += 10;

    // --- SELECTED TRAJECTORY DETAILS ---
    if (selectedTrajectory) {
        checkPageBreak(80);
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Selected Trajectory Details", margin, y);
        y += 10;

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");

        const t = selectedTrajectory;
        
        // Basic Info Table-like structure
        const details = [
            [`ID: ${t.trajectory_id || t.id}`, `User: ${t.user_id}`],
            [`Cluster: ${t.cluster}`, `Frames: ${t.frame_inicial} - ${t.frame_final}`],
            [`Entropy: ${parseFloat(t.shannon_entropy).toFixed(2)}`, `High Speed Ratio: ${parseFloat(t.high_speed_ratio).toFixed(2)}`]
        ];

        details.forEach(row => {
            doc.text(row[0], margin + 5, y);
            doc.text(row[1], margin + 80, y); // Second column
            y += lineHeight;
        });

        // Movement List (Truncated if too long)
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.text("Movement Sequence (First 10 steps):", margin + 5, y);
        y += lineHeight;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        let seq = t.movement_list;
        // Clean up string representation if it's a string like "['a','b']"
        if (typeof seq === 'string') {
            seq = seq.replace(/[\[\]']/g, "").split(", ");
        }
        
        if (Array.isArray(seq)) {
            const preview = seq.slice(0, 10).join(" → ");
            const more = seq.length > 10 ? `... (+${seq.length - 10} more)` : "";
            
            const splitTitle = doc.splitTextToSize(preview + more, pageWidth - (margin * 2));
            doc.text(splitTitle, margin + 5, y);
            y += (splitTitle.length * lineHeight);
        } else {
            doc.text("No movement sequence data available.", margin + 5, y);
            y += lineHeight;
        }
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 10);
    }

    // Save
    doc.save("BehaviourRug_Report.pdf");
}
