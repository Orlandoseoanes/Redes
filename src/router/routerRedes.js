const express = require('express');
const router = express.Router();
const SubnetCIDRAdviser = require('subnet-cidr-calculator');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const axios = require('axios');


router.post('/subnets', (req, res) => {
    let { ip: ipAddress, netmaskBits, numSubnets } = req.body;
  
    // Verificar si se proporciona la dirección IP
    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    // Si netmaskBits es nulo, asignar un valor por defecto
    if (netmaskBits === undefined) {
        netmaskBits = 24; // Valor por defecto
    }

    // Si la máscara de subred es 0, devolver la misma dirección IP
    if (netmaskBits === 0) {
        return res.json({
            subred1: [{
                value: ipAddress,
                ipRange: { start: ipAddress, end: ipAddress },
                range: `${ipAddress}/${netmaskBits}`,
            }]
        });
    }
  
    try {
        // Calcular los bits adicionales necesarios para crear las subredes
        const additionalBits = Math.ceil(Math.log2(numSubnets || 1)); // Si numSubnets es nulo, usar 1
        const newNetmaskBits = netmaskBits + additionalBits;

        if (newNetmaskBits > 32) {
            return res.status(400).json({ error: 'Número de subredes excesivo para la máscara de red proporcionada.' });
        }

        // Calcular las subredes probables con la nueva submáscara
        const result = SubnetCIDRAdviser.calculate(ipAddress, newNetmaskBits);
        let subnets = result.subnets;

        // Si numSubnets no se proporciona, devolver todas las subredes posibles
        if (numSubnets) {
            subnets = subnets.slice(0, numSubnets); // Obtener solo el número requerido de subredes
        }

        // Formatear las subredes con la dirección de broadcast
        const formattedSubnets = subnets.map(subnet => {
            const { value, ipRange, range } = subnet;
            const broadcastAddr = calculateBroadcast(ipRange.start, ipRange.end, newNetmaskBits);
            return { value, ipRange, range, broadcastAddr };
        });

        // Agrupar las subredes en el objeto de respuesta
        const groupedSubnetsObj = {};
        formattedSubnets.forEach((subnet, index) => {
            groupedSubnetsObj[`subred${index + 1}`] = [subnet];
        });

        // Devolver las subredes agrupadas como respuesta
        res.json(groupedSubnetsObj);
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

function calculateBroadcast(ipStart, ipEnd, netmaskBits) {
    const ipPartsStart = ipStart.split('.').map(Number);
    const ipPartsEnd = ipEnd.split('.').map(Number);
    const netmaskParts = calculateNetmask(netmaskBits).split('.').map(Number);

    // Calcular la dirección de broadcast para la subred
    const broadcastParts = [];
    for (let i = 0; i < 4; i++) {
        broadcastParts.push(ipPartsEnd[i] | ~netmaskParts[i]);
    }

    // Devolver la dirección de broadcast de la subred
    const broadcastAddr = broadcastParts.map(part => part & 255).join('.');
    return broadcastAddr;
}

// Función para calcular la máscara de red
function calculateNetmask(netmaskBits) {
    const mask = [];
    for (let i = 0; i < 4; i++) {
        if (netmaskBits >= 8) {
            mask.push(255);
            netmaskBits -= 8;
        } else {
            mask.push(256 - Math.pow(2, 8 - netmaskBits));
            netmaskBits = 0;
        }
    }
    return mask.join('.');
}



const tempDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

router.post('/excelsubnets', (req, res) => {
    let { ip: ipAddress, netmaskBits, numSubnets } = req.body;

    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    if (netmaskBits === undefined) {
        netmaskBits = 24; // Valor por defecto
    }

    try {
        const additionalBits = Math.ceil(Math.log2(numSubnets || 1)); // Si numSubnets es nulo, usar 1
        const newNetmaskBits = netmaskBits + additionalBits;

        if (newNetmaskBits > 32) {
            return res.status(400).json({ error: 'Número de subredes excesivo para la máscara de red proporcionada.' });
        }

        const result = SubnetCIDRAdviser.calculate(ipAddress, newNetmaskBits);
        let subnets = result.subnets;

        if (numSubnets) {
            subnets = subnets.slice(0, numSubnets);
        }

        const formattedSubnets = subnets.map(subnet => {
            const { value, ipRange, range } = subnet;
            const broadcastAddr = calculateBroadcast(ipRange.start, ipRange.end, newNetmaskBits);
            return { Subred: value, Valor: false, Rango: range, Inicio: ipRange.start, Fin: ipRange.end, Broadcast: broadcastAddr };
        });

        const titleRow = ['Proyecto de redes 2024-1', '', '', '', '', ''];
        const ipRow = [ipAddress, '', '', '', '', ''];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedSubnets);

        XLSX.utils.sheet_add_aoa(worksheet, [titleRow], { origin: 0 });
        XLSX.utils.sheet_add_aoa(worksheet, [ipRow], { origin: 1 });

        worksheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Subredes');

        const tempFilePath = path.join(tempDir, 'subredes.xlsx');
        XLSX.writeFile(workbook, tempFilePath);

        const fileContent = fs.readFileSync(tempFilePath);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=subredes.xlsx');
        res.send(fileContent);
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/pdfsubnets', (req, res) => {
    let { ip: ipAddress, netmaskBits, numSubnets } = req.body;

    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    if (netmaskBits === undefined) {
        netmaskBits = 24; // Valor por defecto
    }

    try {
        const additionalBits = Math.ceil(Math.log2(numSubnets || 1)); // Si numSubnets es nulo, usar 1
        const newNetmaskBits = netmaskBits + additionalBits;

        if (newNetmaskBits > 32) {
            return res.status(400).json({ error: 'Número de subredes excesivo para la máscara de red proporcionada.' });
        }

        const result = SubnetCIDRAdviser.calculate(ipAddress, newNetmaskBits);
        let subnets = result.subnets;

        if (numSubnets) {
            subnets = subnets.slice(0, numSubnets);
        }

        const doc = new PDFDocument();

        doc.info.Title = 'Subredes';

        const stream = doc.pipe(res);

        doc.fontSize(20).text('Proyecto de Redes 2024-1', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`IP Original: ${ipAddress}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Número de Subredes: ${numSubnets}`, { align: 'center' });
        doc.moveDown();
        doc.moveDown();

        subnets.forEach((subnet, index) => {
            doc.text(`Subred ${index + 1}: ${subnet.value}`);
            doc.text(`Rango: ${subnet.range}`);
            doc.text(`Inicio: ${subnet.ipRange.start}`);
            doc.text(`Fin: ${subnet.ipRange.end}`);
            doc.text(`Broadcast: ${calculateBroadcast(subnet.ipRange.start, subnet.ipRange.end, newNetmaskBits)}`);
            doc.moveDown();
            doc.moveDown();
        });

        doc.end();

        doc.on('error', err => {
            console.error('Error al generar el PDF:', err);
            res.status(500).json({ error: 'Error interno del servidor.' });
        });

        stream.on('finish', () => {
            res.end();
        });
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/geoubicacion', async (req, res) => {
    try {
        const ip = req.body.ip;
        
        if (!ip) {
            return res.status(400).json({ error: 'IP address is required' });
        }

        const url = `https://api.ip2location.io/?key=896FD73632BDAEA2285FC2B6B5D65146&ip=${ip}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Error:', error);

        if (error.response) {
            return res.status(error.response.status).json({ error: error.response.data });
        }

        res.status(500).json({ error: 'Internal server error' });
    }
});




module.exports = router;


