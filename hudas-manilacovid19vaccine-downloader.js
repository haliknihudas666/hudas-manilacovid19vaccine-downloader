const axios = require('axios').default;
const download = require('download');
const inquirer = require('inquirer');
const fs = require('fs');
const chalk = require('chalk');
const timer = ms => new Promise(res => setTimeout(res, ms))

async function main() {
    console.clear()
    if (!fs.existsSync(process.cwd() + `/documents/`)) {
        fs.mkdirSync(process.cwd() + `/documents/`);
        console.log(chalk.green('Created Documents Folder\n'))
    }

    let getMethod = await inquirer.prompt({
        type: "list",
        name: "type",
        message: "Get Vaccination Data using",
        choices: ["Registered Mobile Number and First Name", "QR Code (For QR Code Scan your qr code first and paste here the result)"]
    });

    if (getMethod.type === "Registered Mobile Number and First Name") {
        let inputPrompts = [{
            type: "input",
            name: "mobileNumber",
            message: "Please enter the registered mobile number",
        },
        {
            type: "input",
            name: "firstName",
            message: "Please enter the registered first name",
        }];

        let inputInquirer = await inquirer.prompt(inputPrompts);

        loginUsingNumberName(inputInquirer.mobileNumber, inputInquirer.firstName)
    } else {
        console.log(chalk.red.bold('\nWARNING: ') + chalk.yellow('The website is using rate limitation and might block you for a minute when using this method.\n'));
        let inputPrompts = [{
            type: "input",
            name: "referenceID",
            message: "Please enter or paste the scanned value of qr code",
        },
        {
            type: "input",
            name: "registrationID",
            message: "Please enter a number where you want to start. Leave blank to start from 0.",
        }];

        let inputInquirer = await inquirer.prompt(inputPrompts);

        var registrationID = '0'
        var response = false;

        if (inputInquirer.registrationID) {
            registrationID = inputInquirer.registrationID
        }

        while (!response) {
            console.log(chalk.blue('TRIES ' + registrationID))
            await timer(500);
            response = await getData(registrationID, inputInquirer.referenceID)

            if (response === 403 || response === 429) {
                response = false;
                console.log(chalk.yellow('RATE LIMITED SLEEPING FOR 2 MINUTES'))
                await timer(1000 * 60 * 2);
            } else {
                registrationID++
            }
        }
    }
}

main();

async function loginUsingNumberName(mobileNumber, firstName) {
    const login = await axios({
        method: 'get',
        url: `https://www.manilacovid19vaccine.ph/search-otp-ajax.php?MobileNo=${mobileNumber}&FirstName=${firstName}`,
    })
    var registrationID = login.data.split('!')[1]
    var referenceID = login.data.split('!')[2]

    getData(registrationID, referenceID)
}

async function getData(registrationID, referenceID) {
    const verify = await axios({
        method: 'get',
        url: `https://www.manilacovid19vaccine.ph/search-registration-ajax.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`,
        withCredentials: true,
    })

    var getCert
    try {
        getCert = await axios({
            method: 'get',
            url: `https://www.manilacovid19vaccine.ph/my-passport-certificate-print.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`,
            withCredentials: true,
            headers: {
                crossDomain: true,
                cookie: verify.headers['set-cookie']
            },
        })
    } catch (error) {
        return error.response.status
    }

    if (!getCert.data.includes('<script>')) {
        if (!fs.existsSync(process.cwd() + `/documents/${referenceID}/`)) {
            fs.mkdirSync(process.cwd() + `/documents/${referenceID}/`);
            console.log(chalk.green(`\nCreated '/documents/${referenceID}/' Folder\n`))
        }

        fs.writeFileSync(`documents/${referenceID}/waiver.pdf`, await download(`https://www.manilacovid19vaccine.ph/waiver.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`));
        console.log(chalk.green('DOWNLOADED Waiver OF ' + referenceID))

        fs.writeFileSync(`documents/${referenceID}/passport-vaccination-id.pdf`, await download(`https://www.manilacovid19vaccine.ph/my-passport-vaccination-id.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`, '', {
            headers: {
                cookie: verify.headers['set-cookie']
            }
        }));
        console.log(chalk.green('DOWNLOADED Vaccination ID OF ' + referenceID))

        fs.writeFileSync(`documents/${referenceID}/passport-vaccination-id-back.pdf`, await download(`https://www.manilacovid19vaccine.ph/my-passport-vaccination-id-back.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`, '', {
            headers: {
                cookie: verify.headers['set-cookie']
            }
        }));
        console.log(chalk.green('DOWNLOADED Vaccination ID Back OF ' + referenceID))

        fs.writeFileSync(`documents/${referenceID}/vaccination-certificate.pdf`, await download(`https://www.manilacovid19vaccine.ph/my-passport-certificate-print.php?RegistrationID=${registrationID}&ReferenceID=${referenceID}`, '', {
            headers: {
                cookie: verify.headers['set-cookie']
            }
        }));
        console.log(chalk.green('DOWNLOADED Vaccination Certificate OF ' + referenceID + '\n'))

        const getFamily = await axios({
            method: 'get',
            url: `https://manilacovid19vaccine.ph/my-passport-family.php`,
            withCredentials: true,
            headers: {
                crossDomain: true,
                cookie: verify.headers['set-cookie']
            },
        })

        var familyMembers = [];
        getFamily.data.match(/href="my-passport-family-members([^"]*)"/g).forEach(element => {
            familyMembers.push('https://manilacovid19vaccine.ph/' + element.replace('href=', '').replace('"', '').replace('"', ''))
        });

        for (const element of familyMembers) {
            var famReferenceID = element.split('?')[1].split('&')[1].replace('ReferenceID=', '');

            if (famReferenceID != referenceID) {
                if (!fs.existsSync(process.cwd() + `/documents/${referenceID}/family/`)) {
                    fs.mkdirSync(process.cwd() + `/documents/${referenceID}/family/`);
                    console.log(chalk.green(`Created '/documents/${referenceID}/family/' Folder`))
                }

                if (!fs.existsSync(process.cwd() + `/documents/${referenceID}/family/${famReferenceID}/`)) {
                    fs.mkdirSync(process.cwd() + `/documents/${referenceID}/family/${famReferenceID}/`);
                    console.log(chalk.green(`Created '/documents/${referenceID}/family/${famReferenceID}/' Folder\n`))
                }

                var fileName;

                if (element.includes('my-passport-family-members-waiver-registration.php')) {
                    fileName = 'waiver'
                } else if (element.includes('my-passport-family-members-vaccination-id.php')) {
                    fileName = 'vaccination-id'
                } else if (element.includes('my-passport-family-members-vaccination-id-back.php')) {
                    fileName = 'vaccination-id-back'
                } else if (element.includes('my-passport-family-members-vaccination-certificate.php')) {
                    fileName = 'vaccination-certificate'
                }

                fs.writeFileSync(`documents/${referenceID}/family/${famReferenceID}/${fileName}.pdf`, await download(element, '', {
                    headers: {
                        cookie: verify.headers['set-cookie']
                    }
                }));

                if (fileName === 'vaccination-certificate') {
                    console.log(chalk.green(`DOWNLOADED FAMILY ${fileName} OF ${famReferenceID}\n`))
                } else {
                    console.log(chalk.green(`DOWNLOADED FAMILY ${fileName} OF ${famReferenceID}`))
                }
            }
        }

        return true
    }

    return false
}
