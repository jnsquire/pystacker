const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const venvDir = path.join(__dirname, '..', '.venv');
const binDir = path.join(__dirname, '..', 'bin');

function runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        console.log(`Running: ${command}`);
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

async function setup() {
    console.log('===== Setting up bundled py-spy executable =====');

    // Check if py-spy already extracted
    const targetExe = process.platform === 'win32'
        ? path.join(binDir, 'py-spy.exe')
        : path.join(binDir, 'py-spy');
    
    if (fs.existsSync(targetExe)) {
        console.log(`py-spy executable already exists at ${targetExe}`);
        console.log('To recreate, delete the bin/ folder and run npm install again.');
        return;
    }

    try {
        // Create temporary venv for installation
        console.log('Creating temporary Python virtual environment...');
        await runCommand('python -m venv .venv', path.join(__dirname, '..'));
        console.log('✓ Virtual environment created');

        // Determine pip path
        const pipExe = process.platform === 'win32' 
            ? path.join(venvDir, 'Scripts', 'pip.exe')
            : path.join(venvDir, 'bin', 'pip');

        // Install py-spy into temporary venv
        console.log('Installing py-spy...');
        await runCommand(`"${pipExe}" install py-spy`, path.join(__dirname, '..'));
        console.log('✓ py-spy installed');

        // Extract py-spy executable to bin/ directory
        console.log('Extracting py-spy executable...');
        const sourceExe = process.platform === 'win32'
            ? path.join(venvDir, 'Scripts', 'py-spy.exe')
            : path.join(venvDir, 'bin', 'py-spy');
        
        if (!fs.existsSync(sourceExe)) {
            throw new Error(`py-spy executable not found at ${sourceExe}`);
        }

        // Create bin directory
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        // Copy executable
        fs.copyFileSync(sourceExe, targetExe);
        
        // Set executable permissions on Unix-like systems
        if (process.platform !== 'win32') {
            fs.chmodSync(targetExe, 0o755);
        }
        
        console.log(`✓ py-spy extracted to ${targetExe}`);

        // Clean up temporary venv
        console.log('Cleaning up temporary virtual environment...');
        fs.rmSync(venvDir, { recursive: true, force: true });
        console.log('✓ Cleanup complete');

        console.log('===== Setup complete! =====');
        console.log(`py-spy is ready at: ${targetExe}`);
    } catch (error) {
        console.error('===== Setup failed =====');
        console.error('Error:', error.message);
        console.error('\nPlease ensure Python 3.7+ is installed and available in your PATH.');
        console.error('You can verify by running: python --version');
        process.exit(1);
    }
}

setup();
