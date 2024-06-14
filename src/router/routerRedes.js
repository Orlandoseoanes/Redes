const express = require('express');
const router = express.Router();
const SubnetCIDRAdviser = require('subnet-cidr-calculator');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const axios = require('axios');


router.post('/subnets', (req, res) => {
    const { ip: ipAddress, netmaskBits, numSubnets } = req.body;

    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    // Si netmaskBits es nulo, asignar un valor por defecto
    const originalNetmaskBits = netmaskBits !== undefined ? netmaskBits : 24;

    // Si la máscara de subred es 0, devolver la misma dirección IP
    if (originalNetmaskBits === 0) {
        return res.json({
            subred1: [{
                value: `${ipAddress}/0`,
                ipRange: { start: ipAddress, end: ipAddress },
                range: false,
                broadcastAddr: ipAddress
            }]
        });
    }

    try {
        // Calcular los bits adicionales necesarios para crear las subredes
        const additionalBits = Math.ceil(Math.log2(numSubnets || 1)); // Si numSubnets es nulo, usar 1
        const newNetmaskBits = originalNetmaskBits + additionalBits;

        if (newNetmaskBits > 32) {
            return res.status(400).json({ error: 'Número de subredes excesivo para la máscara de red proporcionada.' });
        }

        // Si es una dirección IPv4 de clase A con una máscara de subred de /8, devolver la misma dirección IP como única subred
        if (originalNetmaskBits === 8) {
            const ipAddressParts = ipAddress.split('.');
            if (ipAddressParts.length === 4 && parseInt(ipAddressParts[0]) < 128) {
                const endIpAddress = `${ipAddressParts[0]}.255.255.254`;
                const broadcastAddr = `${ipAddressParts[0]}.255.255.255`;
                return res.json({
                    subred1: [{
                        value: `${ipAddress}/${originalNetmaskBits}`,
                        ipRange: { start: ipAddress, end: endIpAddress },
                        range: false,
                        broadcastAddr: broadcastAddr
                    }]
                });
            }
        }

        // Usar SubnetCIDRAdviser para calcular las subredes
        const result = SubnetCIDRAdviser.calculate(ipAddress, originalNetmaskBits, []);
        const subnets = result.subnets.slice(0, numSubnets); // Obtener solo el número necesario de subredes

        const groupedSubnetsObj = {};
        subnets.forEach((subnet, index) => {
            groupedSubnetsObj[`subred${index + 1}`] = [{
                value: subnet.value,
                ipRange: { start: subnet.ipRange.start, end: subnet.ipRange.end },
                range: subnet.range,
                broadcastAddr: subnet.ipRange.end
            }];
        });

        res.json(groupedSubnetsObj);
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/pdfsubnets', (req, res) => {
    const { ip: ipAddress, netmaskBits, numSubnets } = req.body;

    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    // Si netmaskBits es nulo, asignar un valor por defecto
    const originalNetmaskBits = netmaskBits !== undefined ? netmaskBits : 24;

    try {
        // Iniciar el documento PDF
        const doc = new PDFDocument();
        let filename = 'subnets.pdf';
        filename = encodeURIComponent(filename);
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Agregar título
        doc.fontSize(25).text('subredes', {
            align: 'center'
        });
        // Agregar subtítulo: "Proyecto de Redes y Comunicaciones"
        doc.fontSize(18).text('Proyecto de Redes y Comunicaciones', {
            align: 'center'
        });
        doc.moveDown();

        // Agregar subtítulo: "Profesor a cargo: Augusto David Alberto Meza"
        doc.fontSize(16).text('Profesor a cargo: Augusto David Alberto Meza', {
            align: 'center'
        });
        doc.moveDown();


        // Agregar información de la IP original y la submáscara
        doc.moveDown();
        doc.fontSize(16).text(`Dirección IP original: ${ipAddress}`);
        doc.text(`Submáscara: /${originalNetmaskBits}`);
        doc.moveDown();

        // Calcular las subredes
        const result = SubnetCIDRAdviser.calculate(ipAddress, originalNetmaskBits, []);
        const subnets = result.subnets.slice(0, numSubnets); // Obtener solo el número necesario de subredes

        // Agregar las subredes como una lista
        subnets.forEach((subnet, index) => {
            doc.fontSize(14).text(`Subred ${index + 1}`, {
                underline: true
            });
            doc.fontSize(12).text(`Valor: ${subnet.value}`);
            doc.text(`Rango de IP: ${subnet.ipRange.start} - ${subnet.ipRange.end}`);
            doc.text(`Rango: ${subnet.range}`);
            doc.text(`Dirección de Broadcast: ${subnet.ipRange.end}`);
            doc.moveDown();
        });

        // Finalizar el documento
        doc.end();
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});




const tempDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

router.post('/excelsubnets', (req, res) => {
    const { ip: ipAddress, netmaskBits, numSubnets } = req.body;

    if (!ipAddress) {
        return res.status(400).json({ error: 'Se requiere la dirección IP.' });
    }

    // Si netmaskBits es nulo, asignar un valor por defecto
    const originalNetmaskBits = netmaskBits !== undefined ? netmaskBits : 24;

    try {
        // Calcular las subredes
        const result = SubnetCIDRAdviser.calculate(ipAddress, originalNetmaskBits, []);
        const subnets = result.subnets.slice(0, numSubnets); // Obtener solo el número necesario de subredes

        // Formatear los datos de las subredes para el archivo xlsx
        const formattedSubnets = subnets.map((subnet, index) => ({
            'Subred': `Subred ${index + 1}`,
            'Valor': subnet.value,
            'Rango de IP': `${subnet.ipRange.start} - ${subnet.ipRange.end}`,
            'Rango': subnet.range.toString() // Convertir booleano a cadena de texto
        }));

        // Crear un nuevo libro de Excel
        const workbook = xlsx.utils.book_new();

        // Crear una hoja de trabajo
        const worksheet = xlsx.utils.json_to_sheet(formattedSubnets);

        // Agregar la hoja de trabajo al libro de Excel
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Subnets');

        // Convertir el libro de Excel a un buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Enviar el buffer como respuesta
        res.setHeader('Content-Disposition', 'attachment; filename=subnets.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
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


